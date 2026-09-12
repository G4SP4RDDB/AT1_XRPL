import { createContext, useContext, useState, useEffect } from 'react'
import type { FC, ReactNode } from 'react'
import { Wallet } from 'xrpl'
import { walletManager } from '@/lib/xrplConnect'
import { getClient } from '@/lib/xrpl'
import { chainClient } from '@/lib/chainClient'

export interface ConnectedAccount {
  address: string
  name: string
  balance: string
}

interface WalletContextType {
  currentAccount: ConnectedAccount | null
  isConnected: boolean
  isLoading: boolean
  isModalOpen: boolean
  openModal: () => void
  closeModal: () => void
  connectWalletConnect: (onUri?: (uri: string) => void) => Promise<void>
  connectWithSeed: (seed: string) => Promise<void>
  connectWithAddress: (address: string) => Promise<void>
  selectRoleAccount?: (role: 'borrower' | 'lender1' | 'lender2' | 'broker') => void
  refreshBalance: () => Promise<void>
  disconnect: () => Promise<void>
}

export const ROLE_ACCOUNTS = {
  borrower: {
    address: 'rpWUv7aDJMHYcMvT8ZyivDdWbeHLcCJmUb',
    name: 'Borrower (2-of-2 Multisig)',
    description: 'Corporate issuer with multisig-gated repayment',
  },
  lender1: {
    address: 'rEBtH58Zrcp5Fb6MCUufEd7nEpvcnhktR4',
    name: 'Lender 1 (Primary Investor)',
    description: 'Vault depositor & yield accumulator',
  },
  lender2: {
    address: 'r4VipZdQhVVHsNaznMQ16JA2LZe6wsE9ik',
    name: 'Lender 2 (Secondary Investor)',
    description: 'Secondary market allocator',
  },
  broker: {
    address: 'r4araZQfT6Wn4jr2QkiGevUzb6ABFvnBg4',
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
        const balance = await fetchLiveBalance(account.address)
        const connected: ConnectedAccount = {
          address: account.address,
          name: account.adapterName || account.walletName || 'WalletConnect',
          balance,
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

  const connectWalletConnect = async (onUri?: (uri: string) => void) => {
    setIsLoading(true)
    try {
      await walletManager.connect('walletconnect', {
        onQRCode: (uri: string) => {
          if (onUri) onUri(uri)
        },
      })
    } catch (err: any) {
      console.warn('WalletConnect error:', err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const connectWithSeed = async (seed: string) => {
    setIsLoading(true)
    try {
      const trimmed = seed.trim()
      const w = Wallet.fromSeed(trimmed)
      // Register with chain backend shim so tx.* operations can sign
      await chainClient.registerWallet(trimmed).catch((err) => {
        console.warn('Could not register wallet with backend shim:', err)
      })
      const balance = await fetchLiveBalance(w.classicAddress)
      const connected: ConnectedAccount = {
        address: w.classicAddress,
        name: `Wallet (${w.classicAddress.slice(0, 6)}...${w.classicAddress.slice(-4)})`,
        balance,
      }
      setCurrentAccount(connected)
      localStorage.setItem('at1_connected_wallet', JSON.stringify(connected))
      setIsModalOpen(false)
    } finally {
      setIsLoading(false)
    }
  }

  const connectWithAddress = async (address: string) => {
    setIsLoading(true)
    try {
      const trimmed = address.trim()
      const balance = await fetchLiveBalance(trimmed)
      const connected: ConnectedAccount = {
        address: trimmed,
        name: `Wallet (${trimmed.slice(0, 6)}...${trimmed.slice(-4)})`,
        balance,
      }
      setCurrentAccount(connected)
      localStorage.setItem('at1_connected_wallet', JSON.stringify(connected))
      setIsModalOpen(false)
    } finally {
      setIsLoading(false)
    }
  }

  const selectRoleAccount = (roleKey: 'borrower' | 'lender1' | 'lender2' | 'broker') => {
    const roleData = ROLE_ACCOUNTS[roleKey]
    if (!roleData) return
    const connected: ConnectedAccount = {
      address: roleData.address,
      name: roleData.name,
      balance: '...',
    }
    setCurrentAccount(connected)
    localStorage.setItem('at1_connected_wallet', JSON.stringify(connected))
    setIsModalOpen(false)
    fetchLiveBalance(roleData.address).then((bal) => {
      setCurrentAccount((prev) => (prev?.address === roleData.address ? { ...prev, balance: bal } : prev))
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
        connectWalletConnect,
        connectWithSeed,
        connectWithAddress,
        selectRoleAccount,
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
