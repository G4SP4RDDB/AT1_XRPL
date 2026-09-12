// Direct ledger access through the frontend's xrpl client: connection, amendments, faucet, vault reads.
// Read-only against the demo accounts; the only signing uses a throwaway faucet account.
import { afterAll, describe, expect, inject, it } from 'vitest'
import { dropsToXrp, xrpToDrops, type Client } from 'xrpl'
import { disconnectClient, explorerTxUrl, getClient, network } from '@/lib/xrpl'
import { ensureLiquid, faucetAccount, isHash, liquidXrp, waitForAccount } from './helpers'

const reachable = inject('ledgerReachable')
const demo = inject('demo')

describe.skipIf(!reachable)('Devnet ledger (direct xrpl client)', () => {
  let client: Client

  afterAll(async () => {
    await disconnectClient()
  })

  it('connects to the configured WSS endpoint and reports a validated ledger', async () => {
    client = await getClient()
    expect(client.isConnected()).toBe(true)
    expect(client.connection.getUrl()).toBe(inject('wss'))

    const info = await client.request({ command: 'server_info' })
    const ledger = info.result.info.validated_ledger
    expect(ledger).toBeDefined()
    expect(ledger!.seq).toBeGreaterThan(0)
    expect(info.result.info.build_version).toMatch(/^\d+\.\d+/)
  })

  it('has the SingleAssetVault (XLS-65) and LendingProtocol (XLS-66) amendments enabled', async () => {
    const feat = (await client.request({ command: 'feature' } as never)) as {
      result: { features: Record<string, { name: string; enabled: boolean }> }
    }
    const byName = new Map(Object.values(feat.result.features).map((f) => [f.name, f]))
    expect(byName.get('SingleAssetVault')?.enabled).toBe(true)
    expect(byName.get('LendingProtocol')?.enabled).toBe(true)
  })

  it('returns the same connected instance on repeated calls', async () => {
    const again = await getClient()
    expect(again).toBe(client)
  })

  it('funds a throwaway account from the faucet and reads its balance back', async () => {
    const { wallet, balanceXrp } = await faucetAccount()
    expect(wallet.classicAddress).toMatch(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/)
    expect(balanceXrp).toBeGreaterThan(0)

    await waitForAccount(client, wallet.classicAddress)
    const info = await client.request({ command: 'account_info', account: wallet.classicAddress, ledger_index: 'validated' })
    expect(Number(dropsToXrp(info.result.account_data.Balance))).toBeCloseTo(balanceXrp, 0)
  })

  it('submits a signed XRP payment between two throwaway accounts and links it on the explorer', async () => {
    const [a, b] = await Promise.all([faucetAccount(), faucetAccount()])
    await Promise.all([waitForAccount(client, a.wallet.classicAddress), waitForAccount(client, b.wallet.classicAddress)])

    const before = await liquidXrp(client, b.wallet.classicAddress)
    const res = await client.submitAndWait(
      { TransactionType: 'Payment', Account: a.wallet.classicAddress, Destination: b.wallet.classicAddress, Amount: xrpToDrops(5) },
      { autofill: true, wallet: a.wallet },
    )
    const meta = res.result.meta
    expect(typeof meta === 'object' && meta !== null && 'TransactionResult' in meta && meta.TransactionResult).toBe('tesSUCCESS')
    expect(isHash(res.result.hash)).toBe(true)
    expect(explorerTxUrl(res.result.hash)).toBe(`${network.explorer}/transactions/${res.result.hash}`)

    const after = await liquidXrp(client, b.wallet.classicAddress)
    expect(after - before).toBeCloseTo(5, 5)
  })

  it('ensureLiquid is a no-op above the threshold and tops up below it', async () => {
    const { wallet } = await faucetAccount()
    await waitForAccount(client, wallet.classicAddress)
    expect(await ensureLiquid(client, wallet.classicAddress, 100)).toEqual([])
    const hashes = await ensureLiquid(client, wallet.classicAddress, 1_500)
    expect(hashes.length).toBeGreaterThanOrEqual(1)
    expect(hashes.every(isHash)).toBe(true)
    expect(await liquidXrp(client, wallet.classicAddress)).toBeGreaterThanOrEqual(1_500)
  })

  describe.skipIf(!demo)('vault reads on the platform broker', () => {
    it('lists the broker vaults through account_objects and reads one with vault_info', async () => {
      const objs = (await client.request({
        command: 'account_objects',
        account: demo!.broker,
        type: 'vault',
        ledger_index: 'validated',
      } as never)) as { result: { account_objects: Array<{ index: string; LedgerEntryType: string; AssetsTotal?: string; AssetsAvailable?: string; ShareMPTID: string }> } }
      const vaults = objs.result.account_objects
      expect(vaults.length).toBeGreaterThan(0)
      const vault = vaults[0]
      expect(vault.LedgerEntryType).toBe('Vault')
      expect(isHash(vault.index)).toBe(true)

      const vi = (await client.request({ command: 'vault_info', vault_id: vault.index, ledger_index: 'validated' } as never)) as {
        result: { vault: { index: string; AssetsTotal?: string; AssetsAvailable?: string; shares: { OutstandingAmount?: string; mpt_issuance_id: string } } }
      }
      expect(vi.result.vault.index).toBe(vault.index)
      // The ledger omits zero-valued fields (a never-deposited vault has no AssetsTotal/AssetsAvailable/
      // shares.OutstandingAmount at all), same as the app's own read.ts defaults them with `?? 0`.
      const assetsTotal = Number(vi.result.vault.AssetsTotal ?? 0)
      const assetsAvailable = Number(vi.result.vault.AssetsAvailable ?? 0)
      const sharesOutstanding = Number(vi.result.vault.shares.OutstandingAmount ?? 0)
      expect(assetsAvailable).toBeLessThanOrEqual(assetsTotal)
      expect(vi.result.vault.shares.mpt_issuance_id).toBe(vault.ShareMPTID)
      expect(sharesOutstanding).toBeGreaterThanOrEqual(0)
    })
  })
})
