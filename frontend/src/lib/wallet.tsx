import { createContext, useContext, useState, useEffect } from 'react'
import type { FC, ReactNode } from 'react'
import { walletManager } from '@/lib/xrplConnect'
import { getClient } from '@/lib/xrpl'
import { chainClient } from '@/lib/chainClient'

export interface ConnectedAccount {
  address: string
  name: string
  balance: string
  role?: 'borrower' | 'lender' | 'broker' | 'unassigned'
}

interface WalletContextType {
  currentAccount: ConnectedAccount | null
  isConnected: boolean
  isLoading: boolean
  isModalOpen: boolean
  openModal: () => void
  closeModal: () => void
  /** Connect a real, independent wallet — GemWallet/Crossmark (browser extension) or WalletConnect
   *  (Xaman via QR/deep link). The app only ever learns the public address from here on. */
  connectAdapter: (id: AdapterId, onUri?: (uri: string) => void, extra?: { seed?: string }) => Promise<void>
  /** Ask the connected real wallet to sign a prepared (already-autofilled) transaction. Never
   *  submits — the caller hands the resulting blob to the backend's submitSigned/submitAccountMultisigSetup. */
  signTransaction: (tx: Record<string, unknown>) => Promise<{ tx_blob: string }>
  selectRoleAccount: (role: 'broker') => Promise<void>
  connectAccount: (account: { address: string; name: string; role?: 'borrower' | 'lender' | 'broker' | 'unassigned' }) => void
  refreshBalance: () => Promise<void>
  disconnect: () => Promise<void>
}

// The broker is the platform's own fixed, known-in-advance identity (its seed lives in the backend's
// .env as BROKER_SEED, the only user-role key the backend holds). Lenders and borrowers
// have no fixed address anymore: they're independent accounts connected via a real wallet below.
export type AdapterId = 'seed' | 'gemwallet' | 'crossmark' | 'walletconnect'

export const ROLE_ACCOUNTS = {
  broker: {
    address: 'r4r59gviPCnToSNThhHk9qetUwfNc7Rt2N',
    name: 'Platform Broker (Enforcer)',
    description: 'Vault manager & first-loss underwriter',
  },
} as const

const WalletContext = createContext<WalletContextType | undefined>(undefined)

export const WalletProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [currentAccount, setCurrentAccount] = useState<ConnectedAccount | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchLiveBalance = async (address: string): Promise<string> => {
    try {
      const client = await getClient()
      const bal = await client.getXrpBalance(address)
      const num = Number(bal)
      return `${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} XRP`
    } catch (err: any) {
      if (
        err?.data?.error === 'actNotFound' ||
        err?.message?.includes('actNotFound') ||
        err?.data?.error === 'actMalformed'
      ) {
        return '0 XRP'
      }
      console.warn('Failed to fetch live balance for', address, err)
      return '0 XRP'
    }
  }

  const refreshBalance = async () => {
    if (!currentAccount?.address) return
    const bal = await fetchLiveBalance(currentAccount.address)
    setCurrentAccount((prev) => {
      if (!prev) return null
      const updated = { ...prev, balance: bal }
      localStorage.setItem('at1_connected_wallet', JSON.stringify(updated))
      return updated
    })
  }

  useEffect(() => {
    const handleConnect = async (account: any) => {
      if (!account?.address) return
      setIsLoading(true)
      try {
        // The role lives in the backend registry (set at onboarding, or at startup for the
        // platform broker). Resolve it here so a returning account gets its screens and actions
        // back without going through onboarding again.
        const [balance, registered] = await Promise.all([
          fetchLiveBalance(account.address),
          chainClient.getAccount(account.address).catch(() => null),
        ])
        const connected: ConnectedAccount = {
          address: account.address,
          name: registered?.name || account.adapterName || account.walletName || 'WalletConnect',
          balance,
          role: registered?.role ?? undefined,
        }
        setCurrentAccount(connected)
        localStorage.setItem('at1_connected_wallet', JSON.stringify(connected))
      } finally {
        setIsLoading(false)
      }
    }

    const handleDisconnect = () => {
      localStorage.removeItem('at1_connected_wallet')
      setCurrentAccount(null)
    }

    walletManager.on('connect', handleConnect)
    walletManager.on('disconnect', handleDisconnect)

    // Restore if session exists
    if (walletManager.account?.address) {
      handleConnect(walletManager.account)
    } else {
      const saved = localStorage.getItem('at1_connected_wallet')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          if (parsed?.address) {
            setCurrentAccount(parsed)
            fetchLiveBalance(parsed.address).then((bal) => {
              setCurrentAccount((prev) => (prev ? { ...prev, balance: bal } : prev))
            })
            // A restored session may predate onboarding or a role change: re-read the registry.
            chainClient.getAccount(parsed.address).then((registered) => {
              if (!registered?.role) return
              setCurrentAccount((prev) =>
                prev && prev.address === parsed.address ? { ...prev, role: registered.role, name: registered.name || prev.name } : prev
              )
            }).catch(() => {})
          }
        } catch {
          // ignore
        }
      }
    }

    return () => {
      walletManager.off('connect', handleConnect)
      walletManager.off('disconnect', handleDisconnect)
    }
  }, [])

  const openModal = () => {
    setIsModalOpen(true)
    const el = document.getElementById('xrpl-wallet-connector-ui') as any
    if (el) {
      if (typeof el.setWalletManager === 'function') {
        el.setWalletManager(walletManager)
      }
      if (typeof el.open === 'function') {
        el.open()
      }
    }
  }

  const closeModal = () => {
    setIsModalOpen(false)
  }

  const connectAdapter = async (id: AdapterId, onUri?: (uri: string) => void, extra?: { seed?: string }) => {
    setIsLoading(true)
    try {
      const opts = id === 'walletconnect' ? { onQRCode: (uri: string) => { if (onUri) onUri(uri) } } : id === 'seed' ? { seed: extra?.seed } : undefined
      await walletManager.connect(id, opts as any)
    } catch (err: any) {
      console.warn(`${id} connect error:`, err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const signTransaction = async (tx: Record<string, unknown>): Promise<{ tx_blob: string }> => {
    return walletManager.sign(tx as any)
  }

  const selectRoleAccount = async (roleKey: 'broker') => {
    const roleData = ROLE_ACCOUNTS[roleKey]
    if (!roleData) return
    // The live broker address comes from the backend (BROKER_SEED in its .env, registered in the
    // DB at startup); the hardcoded one is only a fallback when the shim is unreachable.
    const live = (await chainClient.listAccounts('broker'))[0]
    const address = live?.address ?? roleData.address
    const connected: ConnectedAccount = {
      address,
      name: live?.name ?? roleData.name,
      balance: '...',
      role: 'broker',
    }
    setCurrentAccount(connected)
    localStorage.setItem('at1_connected_wallet', JSON.stringify(connected))
    setIsModalOpen(false)
    fetchLiveBalance(address).then((bal) => {
      setCurrentAccount((prev) => (prev?.address === address ? { ...prev, balance: bal } : prev))
    })
  }

  const connectAccount = (account: { address: string; name: string; role?: 'borrower' | 'lender' | 'broker' | 'unassigned' }) => {
    const connected: ConnectedAccount = {
      address: account.address,
      name: account.name,
      balance: '...',
      role: account.role,
    }
    setCurrentAccount(connected)
    localStorage.setItem('at1_connected_wallet', JSON.stringify(connected))
    setIsModalOpen(false)
    fetchLiveBalance(account.address).then((bal) => {
      setCurrentAccount((prev) => (prev?.address === account.address ? { ...prev, balance: bal } : prev))
    })
  }

  const disconnect = async () => {
    try {
      await walletManager.disconnect()
    } catch (err) {
      console.warn('Disconnect error:', err)
    }
    localStorage.removeItem('at1_connected_wallet')
    setCurrentAccount(null)
  }

  return (
    <WalletContext.Provider
      value={{
        currentAccount,
        isConnected: currentAccount !== null,
        isLoading,
        isModalOpen,
        openModal,
        closeModal,
        connectAdapter,
        signTransaction,
        selectRoleAccount,
        connectAccount,
        refreshBalance,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider')
  return ctx
}
