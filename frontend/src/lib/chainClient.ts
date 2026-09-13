import { createChainClient, isBlocked } from '@shared/chainClient'
import { notifyTx } from './notifications'
import { walletManager } from './xrplConnect'
import type {
  Bid,
  Ask,
  VaultState as RawVaultState,
  Position as RawPosition,
  TxReceipt,
  WithdrawRequest as RawWithdrawRequest,
  LoanStatus,
  AccountRole,
  DbAccount,
  Blocked,
} from '@shared/types'

export type { Bid, Ask, TxReceipt, AccountRole, DbAccount }


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

// Order-book state (tranche metadata + LP bids) lives on the chain shim's /book/* routes,
// backed by a shared JSON file (src/chain/trancheBookStore.ts) — not localStorage, so every
// browser (the bank's and every LP's) sees the same book instead of its own private copy.
async function callBookRoute<T>(fn: string, args: unknown[]): Promise<T> {
  const res = await fetch(`${CHAIN_URL}/book/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `book.${fn} failed: ${res.status}`)
  }
  return res.json()
}

function normalizeVault(raw: RawVaultState, knownBid?: Bid): VaultState {
  const isCallDateReached = raw.isCallDateReached ?? (raw.callDate ? new Date(raw.callDate).getTime() <= Date.now() : false)
  const liquidAssets = raw.liquidAssets ?? raw.assetsAvailable ?? '0'
  const loanPrincipal = raw.loanPrincipal ?? raw.loan?.principalOutstanding ?? '0'
  const isLiquidityLocked = raw.isLiquidityLocked ?? (Number(loanPrincipal) > 0 && Number(liquidAssets) < Number(loanPrincipal))

  return {
    ...raw,
    borrowerAddress: raw.borrowerAddress ?? knownBid?.borrowerAddress ?? '',
    brokerAddress: raw.brokerAddress ?? '',
    liquidAssets,
    loanPrincipal,
    loanInterestRate: raw.loanInterestRate ?? knownBid?.yieldRate ?? 10,
    loanStatus: raw.loanStatus ?? (raw.loan?.status as any) ?? 'none',
    firstLossCover: raw.firstLossCover ?? '0',
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

export class ChainBackendClient {
  private bids: Bid[] = []
  private asks: Ask[] = []
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
    // Off-chain-authored metadata (borrowerName, description, expiresAt) is shared across
    // browsers via the order-book store, not localStorage — refresh our cache from it.
    try {
      const shared = await callBookRoute<Bid[]>('listTranches', [])
      const cached = new Map(this.bids.map((b) => [b.id, b]))
      for (const b of shared) cached.set(b.id, { ...cached.get(b.id), ...b })
      this.bids = Array.from(cached.values())
    } catch (err) {
      console.warn('Order book unreachable, using local tranche cache:', err)
    }

    try {
      const vaults = await this.getAllVaults()
      const onChainBids: Bid[] = vaults.map((v) => {
        const isRepaid = v.loan ? v.loan.status === 'closed' : false
        const isOriginated = Boolean(v.loan && v.loan.status !== 'closed')
        const status: Bid['status'] = isRepaid ? 'repaid' : isOriginated ? 'originated' : 'open'
        return {
          id: v.bidId || `bid-${v.vaultId.slice(0, 10)}`,
          borrowerAddress: v.borrowerAddress || '',
          amount: v.loanPrincipal || '1000',
          yieldRate: v.loanInterestRate ?? 10,
          callDate: v.callDate,
          vaultId: v.vaultId,
          loanId: v.loan?.loanId,
          status,
          borrowerName: v.borrowerAddress ? `Issuer (${v.borrowerAddress.slice(0, 6)}...${v.borrowerAddress.slice(-4)})` : 'AT1 Bond',
        }
      })

      const map = new Map<string, Bid>()
      for (const b of this.bids) {
        map.set(b.id, b)
      }
      for (const b of onChainBids) {
        const existing = map.get(b.id)
        map.set(b.id, {
          ...existing,
          ...b,
          borrowerName: existing?.borrowerName || b.borrowerName,
          description: existing?.description,
          expiresAt: existing?.expiresAt,
        })
      }

      return Array.from(map.values())
    } catch (err) {
      console.warn('Could not query on-chain bids from backend:', err)
      return [...this.bids]
    }
  }

  /** LP bids (an `Ask` targeting a tranche via `matchedBidId`). Pass a tranche id to scope
   * to one tranche's depth list, or omit for the whole shared book. */
  async getAsks(trancheId?: string): Promise<Ask[]> {
    try {
      const shared = await callBookRoute<Ask[]>('listBids', trancheId ? [trancheId] : [])
      if (!trancheId) this.asks = shared
      return shared
    } catch (err) {
      console.warn('Order book unreachable, using local bid cache:', err)
      return trancheId ? this.asks.filter((a) => a.matchedBidId === trancheId) : [...this.asks]
    }
  }

  async getAllVaults(): Promise<VaultState[]> {
    try {
      const liveVaults = await baseChain.read.listVaults()
      const normalized = liveVaults.map((raw) => {
        const matchingBid = this.bids.find((b) => b.vaultId === raw.vaultId || b.id === raw.bidId)
        return normalizeVault(raw, matchingBid)
      })

      // Sync active vault state to local bids
      for (const v of liveVaults) {
        const b = this.bids.find((bid) => bid.vaultId === v.vaultId || bid.id === v.bidId)
        if (b) {
          if (v.loan && b.status !== 'originated') {
            b.status = 'originated'
            b.loanId = v.loan.loanId
          }
        }
      }

      return normalized
    } catch (err) {
      console.warn('Could not read vaults from chain backend shim:', err)
      return []
    }
  }

  async getVault(vaultId: string): Promise<VaultState | null> {
    try {
      const raw = await baseChain.read.vaultState(vaultId)
      const matchingBid = this.bids.find((b) => b.vaultId === vaultId || b.id === raw.bidId)
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

  /** VaultDeposit: prepared here, signed by the lender's own connected wallet (never this backend),
   *  then submitted. Requires a real wallet (GemWallet/Crossmark/WalletConnect) to be connected as
   *  `lenderAddress` — throws if the connected wallet doesn't match. */
  private async signAndSubmitDeposit(lenderAddress: string, vaultId: string, amountXrp: string): Promise<TxReceipt> {
    if (walletManager.account?.address !== lenderAddress) {
      throw new Error('Connect the lender wallet for this address before depositing — the backend cannot sign on its behalf.')
    }
    const prepared = await baseChain.tx.prepareDeposit(lenderAddress, vaultId, amountXrp)
    const signed = await walletManager.sign(prepared as any)
    return baseChain.tx.submitSigned(signed.tx_blob)
  }

  /** VaultWithdraw for a plain (non-multisig) account: prepared here, signed by the depositor's
   *  own connected wallet, then submitted. */
  private async signAndSubmitWithdraw(req: RawWithdrawRequest): Promise<TxReceipt | Blocked> {
    if (walletManager.account?.address !== req.depositorAddress) {
      throw new Error('Connect this depositor\'s own wallet before withdrawing — the backend cannot sign on its behalf.')
    }
    const result = await baseChain.tx.prepareWithdraw(req)
    if ('blocked' in result) return result
    const signed = await walletManager.sign(result.prepared as any)
    return baseChain.tx.submitSigned(signed.tx_blob)
  }

  async createBid(bidInput: {
    borrowerAddress: string
    borrowerName?: string
    amount: string
    yieldRate: number
    callDate: string
    description?: string
    expiresAt?: string
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
    ;(newBid as any).expiresAt = bidInput.expiresAt

    try {
      // Execute on-chain provision via backend: VaultCreate + LoanBrokerSet + CoverDeposit
      const created = await baseChain.tx.createBond(newBid)
      newBid.vaultId = created.vaultId
      newBid.loanBrokerId = created.loanBrokerId
      const txHash = created.receipts?.[0]?.hash
      notifyTx({
        title: "Émission d'obligation validée",
        message: `VaultCreate & LoanBrokerSet confirmés sur XRPL Devnet.`,
        txHash,
        type: 'success',
      })
    } catch (err: any) {
      console.error('Failed to create on-chain bond vault via backend:', err)
      notifyTx({
        title: "Échec de création on-chain",
        message: err.message,
        type: 'error',
      })
      throw new Error(`Failed to create bond vault on-chain: ${err.message}`)
    }

    try {
      await callBookRoute('upsertTranche', [newBid])
    } catch (err) {
      console.warn('Tranche created on-chain but failed to sync metadata to shared order book:', err)
    }

    this.bids.unshift(newBid)
    this.notify()
    return newBid
  }

  /** LP places an off-chain, indicative bid against a tranche. Nothing on-chain yet —
   * call `acceptBid` to actually fund it via a real VaultDeposit. */
  async createAsk(askInput: {
    lenderAddress: string
    lenderName?: string
    amount: string
    targetYield?: number
    bidId?: string
    expiresAt?: string
  }): Promise<Ask> {
    const newAsk: Ask = {
      id: `ask-${Date.now()}`,
      lenderAddress: askInput.lenderAddress,
      amount: String(askInput.amount),
      indicated: true,
      matchedBidId: askInput.bidId,
      status: 'pending',
    }
    ;(newAsk as any).lenderName = askInput.lenderName || 'Investor'
    ;(newAsk as any).targetYield = askInput.targetYield
    ;(newAsk as any).expiresAt = askInput.expiresAt

    await callBookRoute('createBid', [newAsk])

    this.asks.unshift(newAsk)
    this.notify()
    return newAsk
  }

  /** Convert one pending LP bid into a real on-chain VaultDeposit, up to whatever capacity
   * the vault's AssetsMaximum cap still allows — first-come-first-served; a bid that no
   * longer fits is rejected on-chain (tecINSUFFICIENT_FUNDS-style guardrail), not silently
   * dropped. No loan origination here — call `originateTranche` separately once ready. */
  async acceptBid(askId: string): Promise<{ vaultId: string; txHash: string }> {
    const ask = this.asks.find((a) => a.id === askId) ?? (await this.getAsks()).find((a) => a.id === askId)
    if (!ask) throw new Error('Bid not found')
    const trancheId = ask.matchedBidId
    if (!trancheId) throw new Error('Bid is not targeting a tranche')

    const [bids, vaults] = await Promise.all([this.getBids(), this.getAllVaults()])
    const bid = bids.find((b) => b.id === trancheId)
    const vault = vaults.find((v) => v.bidId === trancheId || v.vaultId === bid?.vaultId)
    const vaultId = vault?.vaultId || bid?.vaultId
    if (!vaultId) throw new Error('Tranche vault not found on ledger')

    const receipt = await this.signAndSubmitDeposit(ask.lenderAddress, vaultId, ask.amount)
    if (receipt.result !== 'tesSUCCESS') {
      throw new Error(`Deposit failed on-chain: ${receipt.result}`)
    }

    ask.status = 'deposited'
    try {
      await callBookRoute('updateBidStatus', [ask.id, 'deposited'])
    } catch (err) {
      console.warn('Deposit succeeded on-chain but failed to sync bid status to shared order book:', err)
    }

    this.notify()
    return { vaultId, txHash: receipt.hash }
  }

  /** Broker/borrower triggers loan origination (LoanSet) once a tranche has collected
   * enough deposits. Safe to call even if not fully filled — the ledger enforces
   * `assetsAvailable >= amount` and returns a normal on-ledger rejection otherwise. */
  async originateTranche(trancheId: string): Promise<{ loanId?: string; txHash: string }> {
    const [bids, vaults] = await Promise.all([this.getBids(), this.getAllVaults()])
    const bid = bids.find((b) => b.id === trancheId)
    if (!bid) throw new Error('Tranche not found')
    const vault = vaults.find((v) => v.bidId === trancheId || v.vaultId === bid.vaultId)
    const vaultId = vault?.vaultId || bid.vaultId
    if (!vaultId) throw new Error('Tranche vault not found on ledger')

    const bidObj: Bid = {
      id: bid.id,
      borrowerAddress: vault?.borrowerAddress || bid.borrowerAddress,
      amount: vault?.loanPrincipal || bid.amount,
      yieldRate: vault?.loanInterestRate ?? bid.yieldRate,
      callDate: vault?.callDate || bid.callDate,
      vaultId,
      loanBrokerId: bid.loanBrokerId,
      status: 'matched',
    }

    const receipt = await baseChain.tx.originate(bidObj)
    this.notify()
    return { loanId: receipt.loanId, txHash: receipt.hash }
  }

  async fundBond(bidId: string, lenderAddress: string, amount: string): Promise<{ vaultId: string; txHash: string }> {
    const allVaults = await this.getAllVaults()
    const v = allVaults.find((vault) => vault.bidId === bidId || vault.vaultId === bidId)
    const bid = this.bids.find((b) => b.id === bidId || b.vaultId === bidId)

    const targetVaultId = v?.vaultId || bid?.vaultId
    if (!targetVaultId) {
      throw new Error('Bond vault not found on ledger')
    }

    // 1. Execute VaultDeposit — prepared by the backend, signed by the lender's own connected wallet
    const depositReceipt = await this.signAndSubmitDeposit(lenderAddress, targetVaultId, amount)
    if (depositReceipt.result !== 'tesSUCCESS') {
      notifyTx({
        title: 'Échec du dépôt on-chain',
        message: `Code rejet ledger: ${depositReceipt.result}`,
        txHash: depositReceipt.hash,
        type: 'error',
      })
      throw new Error(`Deposit failed on-chain: ${depositReceipt.result}`)
    }

    notifyTx({
      title: 'Dépôt validé on-chain (VaultDeposit)',
      message: `${amount} XRP déposés avec succès. Parts de Vault (MPT) émises.`,
      txHash: depositReceipt.hash,
      type: 'success',
    })

    // 2. Originate LoanSet (multisig co-signed) on chain through backend
    const bidObj: Bid = {
      id: v?.bidId || bid?.id || bidId,
      borrowerAddress: v?.borrowerAddress || bid?.borrowerAddress || '',
      amount: v?.loanPrincipal || bid?.amount || amount,
      yieldRate: v?.loanInterestRate ?? bid?.yieldRate ?? 10,
      callDate: v?.callDate || bid?.callDate || new Date().toISOString(),
      vaultId: targetVaultId,
      status: 'matched',
    }

    try {
      const origReceipt = await baseChain.tx.originate(bidObj)
      if (origReceipt.loanId) {
        if (bid) {
          bid.loanId = origReceipt.loanId
          bid.status = 'originated'
        }
      }
    } catch (err: any) {
      console.warn('Originate step warning:', err)
    }

    this.notify()
    return {
      vaultId: targetVaultId,
      txHash: depositReceipt.hash,
    }
  }

  async payCoupon(vaultId: string, _amount?: string): Promise<{ newPps: number; txHash: string }> {
    const vault = await this.getVault(vaultId)
    if (!vault?.loan?.loanId) {
      throw new Error('No active on-chain loan found for this vault')
    }

    const borrowerAddr = vault.borrowerAddress
    if (!borrowerAddr) {
      throw new Error('Borrower address missing from on-chain vault data')
    }

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
    notifyTx({
      title: 'Coupon distribué (LoanPay)',
      message: `Paiement validé on-chain. Le PPS monte à ${(updated?.pps ?? vault.pps).toFixed(6)} !`,
      txHash: r.hash,
      type: 'success',
    })
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
      // Multisig-active accounts: the backend holds both cosigning legs (operator + enforcer),
      // one call settles it. A plain account signs its own VaultWithdraw via its connected wallet.
      const isMultisig = await this.isMasterDisabled(req.depositorAddress)
      const receipt = isMultisig
        ? await baseChain.tx.withdraw(rawReq)
        : await this.signAndSubmitWithdraw(rawReq)

      if (isBlocked(receipt)) {
        notifyTx({
          title: 'Gouvernance Multisig Activée (Enforcer Refusal)',
          message: `Le co-signataire Enforcer a bloqué le retrait : ${receipt.reason}`,
          type: 'error',
        })
        return {
          success: false,
          error: `[Multisig Enforcer Protection] ${receipt.blocked}: ${receipt.reason}`,
        }
      }

      if (receipt.result === 'tesSUCCESS') {
        this.notify()
        notifyTx({
          title: req.mode === 'yield-only' ? 'Rendement récolté (VaultWithdraw)' : 'Retrait intégral validé (VaultWithdraw)',
          message: req.mode === 'yield-only' ? 'Parts de rendement brûlées pour du XRP liquide.' : 'Principal et rendements retirés avec succès.',
          txHash: receipt.hash,
          type: 'success',
        })
        return {
          success: true,
          txHash: receipt.hash,
          sharesBurned: req.mode === 'yield-only' ? 'Yield Shares' : 'All Shares',
          assetsReturned: 'XRP',
        }
      }

      if (receipt.result === 'tecINSUFFICIENT_FUNDS') {
        // Minimum bar guardrail demonstration
        notifyTx({
          title: 'Garde-fou XRPL activé (tecINSUFFICIENT_FUNDS)',
          message: 'Le capital est bloqué dans le prêt jusqu\'au Call Date. Le retrait du principal est impossible.',
          txHash: receipt.hash,
          type: 'error',
        })
        return {
          success: false,
          error: `${receipt.result}: Principal is illiquid while out on loan to the borrower. The vault cannot fulfill full principal redemption prior to loan repayment (Native Protocol Guardrail Verification).`,
          txHash: receipt.hash,
        }
      }

      notifyTx({
        title: 'Rejet du retrait on-chain',
        message: `Code rejet: ${receipt.result}`,
        txHash: receipt.hash,
        type: 'error',
      })

      return {
        success: false,
        error: `Ledger rejected transaction: ${receipt.result}`,
        txHash: receipt.hash,
      }
    } catch (err: any) {
      notifyTx({
        title: 'Erreur de retrait',
        message: err.message,
        type: 'error',
      })
      return {
        success: false,
        error: err.message,
      }
    }
  }

  async executeMultisigRepay(vaultId: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const vault = await this.getVault(vaultId)
    if (!vault?.loan?.loanId) {
      throw new Error('No active loan found for this vault')
    }

    const borrowerAddr = vault.borrowerAddress
    if (!borrowerAddr) {
      throw new Error('Borrower address missing from on-chain vault data')
    }

    const receipt = await baseChain.tx.finalRepayment(vault.loan.loanId, borrowerAddr)

    if (isBlocked(receipt)) {
      notifyTx({
        title: 'Blocage Enforcer (Avant Call Date)',
        message: receipt.reason,
        type: 'error',
      })
      return {
        success: false,
        error: `[Enforcer 2-of-2 Policy Refusal] ${receipt.reason}. Principal repayment before call date is disallowed.`,
      }
    }

    const r = receipt as TxReceipt
    if (r.result !== 'tesSUCCESS') {
      notifyTx({
        title: 'Rejet du remboursement',
        message: `Code rejet: ${r.result}`,
        txHash: r.hash,
        type: 'error',
      })
      return {
        success: false,
        error: `Ledger rejected repayment: ${r.result}`,
      }
    }

    this.notify()
    notifyTx({
      title: 'Remboursement Multisig 2-of-2 validé',
      message: 'Prêt soldé on-chain avec approbation de l\'Enforcer. Liquidité débloquée !',
      txHash: r.hash,
      type: 'success',
    })
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
    if (r.result === 'tesSUCCESS') {
      notifyTx({
        title: 'Dépréciation LoanManage validée',
        message: 'Perte absorbée par le capital de premier risque du broker.',
        txHash: r.hash,
        type: 'success',
      })
    }
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
    if (r.result === 'tesSUCCESS') {
      notifyTx({
        title: 'Restauration LoanManage validée',
        message: 'Santé de l\'emprunt restaurée sur le ledger.',
        txHash: r.hash,
        type: 'success',
      })
    }
    return {
      success: r.result === 'tesSUCCESS',
      txHash: r.hash,
      error: r.result === 'tesSUCCESS' ? undefined : r.result,
    }
  }

  /** Converts `address` to a 2-of-2 multisig (operator + platform enforcer, master key disabled).
   *  The two setup transactions (SignerListSet, AccountSet) are signed by the account's own
   *  connected wallet — the backend only prepares them and never holds this account's master key.
   *  The operator cosigning key itself stays backend-held (see src/chain/brokerLoanSetKey.ts-style
   *  comment in ops.ts: no wallet adapter today can produce a multisig-shaped signature). */
  async setupMultisig(address: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (walletManager.account?.address !== address) {
      return { success: false, error: "Connect this account's own wallet before activating multisig." }
    }
    try {
      const { signerListSet, disableMaster } = await baseChain.tx.prepareAccountMultisigSetup(address)
      const signedSignerListSet = await walletManager.sign(signerListSet as any)
      const signedDisableMaster = await walletManager.sign(disableMaster as any)
      const receipt = await baseChain.tx.submitAccountMultisigSetup(address, signedSignerListSet.tx_blob, signedDisableMaster.tx_blob)
      if (receipt.result === 'tesSUCCESS') {
        notifyTx({
          title: 'Gouvernance Multisig 2/2 Activée',
          message: 'Multisig 2-sur-2 configuré on-chain avec Enforcer et clé maître désactivée.',
          txHash: receipt.hash || undefined,
          type: 'success',
        })
        return { success: true, txHash: receipt.hash }
      }
      return { success: false, error: receipt.result }
    } catch (err: any) {
      notifyTx({
        title: 'Erreur activation Multisig',
        message: err.message,
        type: 'error',
      })
      return { success: false, error: err.message }
    }
  }

  async getRoles(): Promise<Record<string, string>> {
    try {
      return await baseChain.read.roles()
    } catch {
      return {}
    }
  }

  async isMasterDisabled(address: string): Promise<boolean> {
    try {
      const res = await baseChain.read.isMasterDisabled(address)
      return res.masterDisabled
    } catch {
      return false
    }
  }

  async listAccounts(role?: AccountRole) {
    try {
      return await baseChain.read.listAccounts(role)
    } catch {
      return []
    }
  }

  async getAccount(address: string): Promise<DbAccount | null> {
    try {
      return await baseChain.read.getAccount(address)
    } catch {
      return null
    }
  }

  async updateAccount(params: { address: string; role?: AccountRole; name?: string; company?: string; firstName?: string; userRole?: string; multisigActive?: number }) {
    return await baseChain.tx.updateAccount(params)
  }

  async depositCover(loanBrokerId: string, amountXrp: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const r = await baseChain.tx.depositCover(loanBrokerId, amountXrp)
      this.notify()
      if (r.result === 'tesSUCCESS') {
        notifyTx({
          title: 'First-Loss Capital Déposé',
          message: `${amountXrp} XRP ajoutés à la couverture du courtier sur le ledger.`,
          txHash: r.hash,
          type: 'success',
        })
        return { success: true, txHash: r.hash }
      }
      return { success: false, error: r.result }
    } catch (err: any) {
      notifyTx({
        title: 'Erreur dépôt de couverture',
        message: err.message,
        type: 'error',
      })
      return { success: false, error: err.message }
    }
  }
}

export const chainClient = new ChainBackendClient()
export const mockChainClient = chainClient
