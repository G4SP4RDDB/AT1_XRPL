import { createChainClient, isBlocked } from '@shared/chainClient'
import type {
  Bid,
  Ask,
  VaultState as RawVaultState,
  Position as RawPosition,
  TxReceipt,
  WithdrawRequest as RawWithdrawRequest,
  LoanStatus,
} from '@shared/types'

export type { Bid, Ask, TxReceipt }

export interface VaultState extends RawVaultState {
  borrowerAddress: string
  brokerAddress: string
  liquidAssets: string
  loanPrincipal: string
  loanInterestRate: number
  loanStatus: LoanStatus
  firstLossCover: string
  isCallDateReached: boolean
  isLiquidityLocked: boolean
}

export interface UserPosition extends RawPosition {
  accountAddress: string
  sharesOwned: string
  yieldEquivalentShares: string
}

export interface WithdrawRequest {
  depositorAddress: string
  vaultId: string
  mode: 'yield-only' | 'full'
  sharesToBurn?: string
  expectedAssets?: string
}

const CHAIN_URL = import.meta.env.VITE_CHAIN_URL || 'http://localhost:8787'
const baseChain = createChainClient(CHAIN_URL)

// Known Hackathon Devnet addresses from .env
const DEFAULT_BROKER = 'r4araZQfT6Wn4jr2QkiGevUzb6ABFvnBg4'
const DEFAULT_BORROWER = 'rpWUv7aDJMHYcMvT8ZyivDdWbeHLcCJmUb'

const BIDS_KEY = 'at1_bids_v2'
const ASKS_KEY = 'at1_asks_v2'

function loadBids(): Bid[] {
  try {
    const raw = localStorage.getItem(BIDS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.filter((b: Bid) => b.id && !b.id.includes('tier1-open') && !b.id.includes('demo-1'))
        : []
    }
  } catch (e) {
    console.warn('Failed to parse stored bids:', e)
  }
  return []
}

function saveBids(bids: Bid[]) {
  try {
    localStorage.setItem(BIDS_KEY, JSON.stringify(bids))
  } catch (e) {
    console.warn('Failed to save bids:', e)
  }
}

function loadAsks(): Ask[] {
  try {
    const raw = localStorage.getItem(ASKS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.filter((a: Ask) => a.id && !a.id.includes('institutional'))
        : []
    }
  } catch (e) {
    console.warn('Failed to parse stored asks:', e)
  }
  return []
}

function saveAsks(asks: Ask[]) {
  try {
    localStorage.setItem(ASKS_KEY, JSON.stringify(asks))
  } catch (e) {
    console.warn('Failed to save asks:', e)
  }
}

function normalizeVault(raw: RawVaultState, knownBid?: Bid): VaultState {
  const isCallDateReached = new Date(raw.callDate).getTime() <= Date.now()
  const liquidAssets = raw.assetsAvailable ?? '0'
  const loanPrincipal = raw.loan?.principalOutstanding ?? '0'
  const isLiquidityLocked = Number(loanPrincipal) > 0 && Number(liquidAssets) < Number(loanPrincipal)

  return {
    ...raw,
    borrowerAddress: knownBid?.borrowerAddress ?? DEFAULT_BORROWER,
    brokerAddress: DEFAULT_BROKER,
    liquidAssets,
    loanPrincipal,
    loanInterestRate: knownBid?.yieldRate ?? 10,
    loanStatus: (raw.loan?.status as any) ?? 'none',
    firstLossCover: '150',
    isCallDateReached,
    isLiquidityLocked,
  }
}

function normalizePosition(raw: RawPosition): UserPosition {
  return {
    ...raw,
    accountAddress: raw.depositorAddress,
    sharesOwned: raw.shares,
    yieldEquivalentShares: raw.yieldShares,
  }
}

class LiveChainClient {
  private bids: Bid[] = loadBids()
  private asks: Ask[] = loadAsks()
  private listeners: Array<() => void> = []

  subscribe(listener: () => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  private notify() {
    this.listeners.forEach((l) => {
      try {
        l()
      } catch (err) {
        console.warn('Listener error:', err)
      }
    })
  }

  async getBids(): Promise<Bid[]> {
    return [...this.bids]
  }

  async getAsks(): Promise<Ask[]> {
    return [...this.asks]
  }

  async getAllVaults(): Promise<VaultState[]> {
    try {
      const liveVaults = await baseChain.read.listVaults()
      const normalized = liveVaults.map((raw) => {
        const matchingBid = this.bids.find((b) => b.vaultId === raw.vaultId)
        return normalizeVault(raw, matchingBid)
      })

      // Sync active vault status to bids
      for (const v of liveVaults) {
        const b = this.bids.find((bid) => bid.vaultId === v.vaultId)
        if (b) {
          if (v.loan && b.status !== 'originated') {
            b.status = 'originated'
            b.loanId = v.loan.loanId
            saveBids(this.bids)
          }
        }
      }

      return normalized
    } catch (err) {
      console.warn('Could not read vaults from chain shim:', err)
      return []
    }
  }

  async getVault(vaultId: string): Promise<VaultState | null> {
    try {
      const raw = await baseChain.read.vaultState(vaultId)
      const matchingBid = this.bids.find((b) => b.vaultId === vaultId)
      return normalizeVault(raw, matchingBid)
    } catch (err) {
      console.warn(`Could not read vault ${vaultId}:`, err)
      return null
    }
  }

  async getUserPosition(account: string, vaultId: string): Promise<UserPosition | null> {
    try {
      const pos = await baseChain.read.position(account, vaultId)
      if (!pos || pos.shares === '0') return null
      return normalizePosition(pos)
    } catch (err) {
      console.warn(`Could not read position for ${account} in ${vaultId}:`, err)
      return null
    }
  }

  async createBid(bidInput: {
    borrowerAddress: string
    borrowerName?: string
    amount: string
    yieldRate: number
    callDate: string
    description?: string
  }): Promise<Bid> {
    const callDateIso = new Date(bidInput.callDate).toISOString()
    const newBid: Bid = {
      id: `bid-${Date.now()}`,
      borrowerAddress: bidInput.borrowerAddress,
      amount: String(bidInput.amount),
      yieldRate: Number(bidInput.yieldRate),
      callDate: callDateIso,
      status: 'open',
    }
    ;(newBid as any).borrowerName = bidInput.borrowerName || 'AT1 Bond'
    ;(newBid as any).description = bidInput.description

    try {
      // 12s on-chain provision: VaultCreate + LoanBrokerSet + CoverDeposit
      const created = await baseChain.tx.createBond(newBid)
      newBid.vaultId = created.vaultId
      newBid.loanBrokerId = created.loanBrokerId
    } catch (err: any) {
      console.error('Failed to create on-chain bond vault:', err)
      throw new Error(`Failed to create bond vault on-chain: ${err.message}`)
    }

    this.bids.unshift(newBid)
    saveBids(this.bids)
    this.notify()
    return newBid
  }

  async createAsk(askInput: {
    lenderAddress: string
    lenderName?: string
    amount: string
    targetYield?: number
    bidId?: string
  }): Promise<Ask> {
    const newAsk: Ask = {
      id: `ask-${Date.now()}`,
      lenderAddress: askInput.lenderAddress,
      amount: String(askInput.amount),
      indicated: true,
      matchedBidId: askInput.bidId,
    }
    ;(newAsk as any).lenderName = askInput.lenderName || 'Investor'

    this.asks.unshift(newAsk)
    saveAsks(this.asks)
    this.notify()
    return newAsk
  }

  async fundBond(bidId: string, lenderAddress: string, amount: string): Promise<{ vaultId: string; txHash: string }> {
    const bid = this.bids.find((b) => b.id === bidId)
    if (!bid) throw new Error('Bid not found')

    if (!bid.vaultId || !bid.loanBrokerId) {
      // Create on-chain bond if not already created
      const created = await baseChain.tx.createBond(bid)
      bid.vaultId = created.vaultId
      bid.loanBrokerId = created.loanBrokerId
    }

    // 1. VaultDeposit
    const depositReceipt = await baseChain.tx.deposit(lenderAddress, bid.vaultId, amount)
    if (depositReceipt.result !== 'tesSUCCESS') {
      throw new Error(`Deposit failed on-chain: ${depositReceipt.result}`)
    }

    // 2. Originate LoanSet (multisig co-signed)
    bid.status = 'matched'
    try {
      const origReceipt = await baseChain.tx.originate(bid)
      if (origReceipt.loanId) {
        bid.loanId = origReceipt.loanId
        bid.status = 'originated'
      }
    } catch (err: any) {
      console.warn('Originate step warning:', err)
    }

    saveBids(this.bids)
    this.notify()
    return {
      vaultId: bid.vaultId,
      txHash: depositReceipt.hash,
    }
  }

  async matchAndDeposit(bidId: string, askId: string): Promise<{ vaultId: string; txHash: string }> {
    const ask = this.asks.find((a) => a.id === askId)
    if (!ask) throw new Error('Ask not found')
    const res = await this.fundBond(bidId, ask.lenderAddress, ask.amount)
    ask.matchedBidId = bidId
    saveAsks(this.asks)
    this.notify()
    return res
  }

  async payCoupon(vaultId: string, _amount?: string): Promise<{ newPps: number; txHash: string }> {
    const vault = await this.getVault(vaultId)
    if (!vault?.loan?.loanId) {
      throw new Error('No active on-chain loan found for this vault')
    }

    const borrowerAddr = vault.borrowerAddress || DEFAULT_BORROWER
    const receipt = await baseChain.tx.payCoupon(vault.loan.loanId, borrowerAddr)

    if (isBlocked(receipt)) {
      throw new Error(`[Enforcer Refused Coupon]: ${receipt.reason}`)
    }

    const r = receipt as TxReceipt
    if (r.result !== 'tesSUCCESS') {
      throw new Error(`LoanPay rejected on-ledger: ${r.result}`)
    }

    const updated = await this.getVault(vaultId)
    this.notify()
    return {
      newPps: updated?.pps ?? vault.pps,
      txHash: r.hash,
    }
  }

  async withdraw(req: { depositorAddress: string; vaultId: string; mode: 'yield-only' | 'full' }): Promise<{
    success: boolean
    error?: string
    txHash?: string
    sharesBurned?: string
    assetsReturned?: string
  }> {
    const rawReq: RawWithdrawRequest = {
      depositorAddress: req.depositorAddress,
      vaultId: req.vaultId,
      mode: req.mode,
    }

    try {
      const receipt = await baseChain.tx.withdraw(rawReq)

      if (receipt.result === 'tesSUCCESS') {
        this.notify()
        return {
          success: true,
          txHash: receipt.hash,
          sharesBurned: req.mode === 'yield-only' ? 'Yield Shares' : 'All Shares',
          assetsReturned: 'XRP',
        }
      }

      if (receipt.result === 'tecINSUFFICIENT_FUNDS') {
        // Minimum bar guardrail demonstration!
        return {
          success: false,
          error: `${receipt.result}: Principal is illiquid while out on loan to the borrower. The vault cannot fulfill full principal redemption prior to loan repayment (Native Protocol Guardrail Verification).`,
          txHash: receipt.hash,
        }
      }

      return {
        success: false,
        error: `Ledger rejected transaction: ${receipt.result}`,
        txHash: receipt.hash,
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      }
    }
  }

  async executeMultisigRepay(
    vaultId: string,
    _overrideCallDate?: boolean
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const vault = await this.getVault(vaultId)
    if (!vault?.loan?.loanId) {
      throw new Error('No active loan found for this vault')
    }

    const borrowerAddr = vault.borrowerAddress || DEFAULT_BORROWER
    const receipt = await baseChain.tx.finalRepayment(vault.loan.loanId, borrowerAddr)

    if (isBlocked(receipt)) {
      return {
        success: false,
        error: `[Enforcer 2-of-2 Policy Refusal] ${receipt.reason}. Principal repayment before call date is disallowed.`,
      }
    }

    const r = receipt as TxReceipt
    if (r.result !== 'tesSUCCESS') {
      return {
        success: false,
        error: `Ledger rejected repayment: ${r.result}`,
      }
    }

    this.notify()
    return {
      success: true,
      txHash: r.hash,
    }
  }

  async impair(vaultId: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const vault = await this.getVault(vaultId)
    if (!vault?.loan?.loanId) throw new Error('No active loan to impair')
    const r = await baseChain.tx.impair(vault.loan.loanId)
    this.notify()
    return {
      success: r.result === 'tesSUCCESS',
      txHash: r.hash,
      error: r.result === 'tesSUCCESS' ? undefined : r.result,
    }
  }

  async unimpair(vaultId: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const vault = await this.getVault(vaultId)
    if (!vault?.loan?.loanId) throw new Error('No active loan to unimpair')
    const r = await baseChain.tx.unimpair(vault.loan.loanId)
    this.notify()
    return {
      success: r.result === 'tesSUCCESS',
      txHash: r.hash,
      error: r.result === 'tesSUCCESS' ? undefined : r.result,
    }
  }
}

export const mockChainClient = new LiveChainClient()
export const chainClient = mockChainClient
