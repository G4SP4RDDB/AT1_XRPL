// Full AT1 bond lifecycle through the chain shim, exactly the calls the UI makes (docs/frontend-integration.md):
//   createBond -> deposit -> originate -> full withdraw refused (guardrail) -> coupon -> PPS up -> yield-only withdraw
//   -> final repayment refused before the call date. With INTEGRATION_CLOSE=1 it then waits for the call date,
//   settles the bond and withdraws principal plus yield.
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createChainClient, isBlocked, isSuccess, type ChainClient } from '@shared/chainClient'
import type { Bid, Position, TxReceipt, VaultState } from '@shared/types'
import { disconnectClient, getClient, network } from '@/lib/xrpl'
import { ensureLiquid, isHash, sleep } from './helpers'

const chainUrl = inject('chainUrl')
const demo = inject('demo')
const CLOSE = process.env.INTEGRATION_CLOSE === '1'

const AMOUNT_XRP = '200' // small enough to run many times on the demo balances; interest shows in drops
const YIELD_PCT = 100 // maximum rate so accrued yield is visible within minutes
const CALL_MINUTES = 3 // terms floor: 3 payments at least 60 s apart

const expectSuccess = (r: TxReceipt | { blocked: string; reason: string }): TxReceipt => {
  if (isBlocked(r as never)) throw new Error(`blocked: ${(r as { reason: string }).reason}`)
  const receipt = r as TxReceipt
  expect(receipt.result).toBe('tesSUCCESS')
  expect(isHash(receipt.hash)).toBe(true)
  expect(receipt.explorerUrl).toBe(`${network.explorer}/transactions/${receipt.hash}`)
  return receipt
}

describe.skipIf(!chainUrl || !demo)('AT1 bond lifecycle through the chain shim', () => {
  let chain: ChainClient
  let bid: Bid
  let vault: VaultState
  let position: Position
  const hashes: Record<string, string> = {}

  beforeAll(async () => {
    chain = createChainClient(chainUrl!)
    // Keep the demo roles funded so the suite can run back to back. Throwaway faucet accounts pay the top-ups.
    const client = await getClient()
    await ensureLiquid(client, demo!.lender, Number(AMOUNT_XRP) + 30)
    await ensureLiquid(client, demo!.broker, 250)
    await ensureLiquid(client, demo!.borrower, 60)
    bid = {
      id: `it-${Date.now().toString(36)}`,
      borrowerAddress: demo!.borrower,
      amount: AMOUNT_XRP,
      yieldRate: YIELD_PCT,
      callDate: new Date(Date.now() + CALL_MINUTES * 60_000).toISOString(),
      status: 'open',
    }
  })

  afterAll(async () => {
    await disconnectClient()
    if (Object.keys(hashes).length) {
      console.log('\nOn-chain transactions from this run:')
      for (const [step, h] of Object.entries(hashes)) console.log(`  ${step.padEnd(22)} ${network.explorer}/transactions/${h}`)
    }
  })

  it('createBond: VaultCreate + LoanBrokerSet + cover deposit, all validated', async () => {
    const created = await chain.tx.createBond(bid)
    expect(isHash(created.vaultId)).toBe(true)
    expect(isHash(created.loanBrokerId)).toBe(true)
    expect(created.receipts).toHaveLength(3)
    created.receipts.forEach(expectSuccess)
    ;['VaultCreate', 'LoanBrokerSet', 'LoanBrokerCoverDeposit'].forEach((s, i) => (hashes[s] = created.receipts[i].hash))
    bid = { ...bid, vaultId: created.vaultId, loanBrokerId: created.loanBrokerId, status: 'matched' }
  })

  it('a fresh vault is empty, carries the bid call date and shows up in listVaults', async () => {
    vault = await chain.read.vaultState(bid.vaultId!)
    expect(vault.vaultId).toBe(bid.vaultId)
    expect(vault.asset).toBe('XRP')
    expect(vault.assetsTotal).toBe('0')
    expect(vault.assetsAvailable).toBe('0')
    expect(vault.sharesTotal).toBe('0')
    expect(vault.loan).toBeUndefined()
    expect(vault.stub).toBeUndefined()
    expect(Math.abs(new Date(vault.callDate).getTime() - new Date(bid.callDate).getTime())).toBeLessThan(1_000)

    const all = await chain.read.listVaults()
    expect(all.map((v) => v.vaultId)).toContain(bid.vaultId)
  })

  it('deposit: the matched lender funds the vault and receives shares at PPS 1', async () => {
    hashes.VaultDeposit = expectSuccess(await chain.tx.deposit(demo!.lender, bid.vaultId!, bid.amount)).hash

    vault = await chain.read.vaultState(bid.vaultId!)
    expect(vault.assetsTotal).toBe(AMOUNT_XRP)
    expect(vault.assetsAvailable).toBe(AMOUNT_XRP)
    expect(vault.pps).toBe(1)

    position = await chain.read.position(demo!.lender, bid.vaultId!)
    expect(position.shares).toBe(String(Number(AMOUNT_XRP) * 1_000_000))
    expect(position.principalDeposited).toBe(AMOUNT_XRP)
    expect(position.currentValue).toBe(AMOUNT_XRP)
    expect(position.accruedYield).toBe('0')
    expect(position.yieldShares).toBe('0')
  })

  it('originate: LoanSet with the multisig borrower moves the principal out of the vault', async () => {
    const o = await chain.tx.originate(bid)
    expectSuccess(o)
    expect(isHash(o.loanId ?? '')).toBe(true)
    hashes.LoanSet = o.hash
    bid = { ...bid, loanId: o.loanId, status: 'originated' }

    vault = await chain.read.vaultState(bid.vaultId!)
    expect(vault.assetsAvailable).toBe('0')
    expect(Number(vault.assetsTotal)).toBeGreaterThanOrEqual(Number(AMOUNT_XRP))
    expect(vault.loan).toBeDefined()
    expect(vault.loan!.loanId).toBe(o.loanId)
    expect(vault.loan!.status).toBe('active')
    expect(vault.loan!.paymentRemaining).toBe(3)
    expect(vault.loan!.principalOutstanding).toBe(AMOUNT_XRP)
    expect(Number(vault.loan!.periodicPayment)).toBeGreaterThan(0)
    expect(new Date(vault.loan!.nextPaymentDueDate).getTime()).toBeGreaterThan(Date.now() - 60_000)
  })

  it('guardrail: a full withdrawal while the principal is lent is rejected by the ledger', async () => {
    const r = await chain.tx.withdraw({ depositorAddress: demo!.lender, vaultId: bid.vaultId!, mode: 'full' })
    expect(isSuccess(r)).toBe(false)
    expect(r.result).toBe('tecINSUFFICIENT_FUNDS')
    expect(isHash(r.hash)).toBe(true)
    hashes['VaultWithdraw (full)'] = r.hash

    position = await chain.read.position(demo!.lender, bid.vaultId!)
    expect(position.shares).toBe(String(Number(AMOUNT_XRP) * 1_000_000))
  })

  it('finalRepayment before the call date is refused by the enforcer, nothing is submitted', async () => {
    const r = await chain.tx.finalRepayment(bid.loanId!, bid.borrowerAddress)
    expect(isBlocked(r)).toBe(true)
    if (isBlocked(r)) {
      expect(r.blocked).toBe('before-call-date')
      expect(r.reason).toMatch(/call date/)
    }
  })

  it('payCoupon: the enforcer co-signs a scheduled coupon and PPS rises', async () => {
    const before = vault
    const r = await chain.tx.payCoupon(bid.loanId!, bid.borrowerAddress)
    hashes['LoanPay (coupon)'] = expectSuccess(r).hash

    vault = await chain.read.vaultState(bid.vaultId!)
    expect(vault.loan!.paymentRemaining).toBe(2)
    expect(Number(vault.assetsAvailable)).toBeGreaterThan(0)
    expect(vault.pps).toBeGreaterThan(before.pps)
    expect(Number(vault.loan!.principalOutstanding)).toBeLessThan(Number(before.loan!.principalOutstanding))

    position = await chain.read.position(demo!.lender, bid.vaultId!)
    expect(Number(position.accruedYield)).toBeGreaterThan(0)
    expect(Number(position.currentValue)).toBeGreaterThan(Number(AMOUNT_XRP))
    expect(Number(position.yieldShares)).toBeGreaterThan(0)
    expect(Number(position.yieldShares)).toBeLessThan(Number(position.shares))
  })

  it('yield-only withdrawal redeems the accrued yield and leaves the principal shares in place', async () => {
    const sharesBefore = Number(position.shares)
    const yieldShares = Number(position.yieldShares)
    hashes['VaultWithdraw (yield)'] = expectSuccess(
      await chain.tx.withdraw({ depositorAddress: demo!.lender, vaultId: bid.vaultId!, mode: 'yield-only' }),
    ).hash

    position = await chain.read.position(demo!.lender, bid.vaultId!)
    expect(Number(position.shares)).toBe(sharesBefore - yieldShares)
    expect(Number(position.shares)).toBeGreaterThanOrEqual(Number(AMOUNT_XRP) * 1_000_000 - yieldShares)
    expect(Number(position.yieldShares)).toBeLessThan(yieldShares)
  })

  it('the ledger refuses a coupon that is not due yet or accepts an early one, but never silently drops it', async () => {
    const r = await chain.tx.payCoupon(bid.loanId!, bid.borrowerAddress)
    if (isBlocked(r)) {
      expect(r.reason).toBeTruthy()
      return
    }
    expect(isHash(r.hash)).toBe(true)
    if (r.result === 'tesSUCCESS') {
      hashes['LoanPay (coupon 2)'] = r.hash
      vault = await chain.read.vaultState(bid.vaultId!)
      expect(vault.loan!.paymentRemaining).toBe(1)
    } else {
      expect(r.result).toMatch(/^tec/)
    }
  })

  describe.skipIf(!CLOSE)('settlement at the call date (INTEGRATION_CLOSE=1)', () => {
    it('finalRepayment after the call date settles the loan and the lender withdraws principal plus yield', async () => {
      const callAt = new Date(vault.callDate).getTime()
      const wait = callAt + 8_000 - Date.now()
      if (wait > 0) await sleep(wait)

      const r = await chain.tx.finalRepayment(bid.loanId!, bid.borrowerAddress)
      hashes['LoanPay (final)'] = expectSuccess(r).hash

      vault = await chain.read.vaultState(bid.vaultId!)
      expect(vault.loan!.status).toBe('closed')
      expect(vault.loan!.paymentRemaining).toBe(0)
      expect(vault.assetsAvailable).toBe(vault.assetsTotal)

      const full = await chain.tx.withdraw({ depositorAddress: demo!.lender, vaultId: bid.vaultId!, mode: 'full' })
      hashes['VaultWithdraw (all)'] = expectSuccess(full).hash
      position = await chain.read.position(demo!.lender, bid.vaultId!)
      expect(position.shares).toBe('0')
    }, 6 * 60_000)
  })
})
