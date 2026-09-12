// Shared helpers for the integration suites. Throwaway faucet accounts only: the demo seeds stay in the root .env.
import { Wallet, dropsToXrp, xrpToDrops, type Client } from 'xrpl'
import { network } from '@/lib/xrpl'

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Ask the hackathon faucet for a fresh account (1000 XRP). The faucet answers before the funding is validated. */
export async function faucetAccount(): Promise<{ wallet: Wallet; balanceXrp: number }> {
  const res = await fetch(network.faucet, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  if (!res.ok) throw new Error(`faucet ${res.status}: ${await res.text()}`)
  const body = (await res.json()) as { account: { address: string; secret: string }; balance: number }
  return { wallet: Wallet.fromSeed(body.account.secret), balanceXrp: body.balance }
}

/** Blocks until the account shows up on a validated ledger (up to ~30 s). */
export async function waitForAccount(client: Client, address: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      await client.request({ command: 'account_info', account: address, ledger_index: 'validated' })
      return
    } catch {
      await sleep(1_000)
    }
  }
  throw new Error(`account ${address} never appeared on a validated ledger`)
}

/** Liquid XRP: balance minus the base reserve and owner reserves. */
export async function liquidXrp(client: Client, address: string): Promise<number> {
  const r = await client.request({ command: 'account_info', account: address, ledger_index: 'validated' })
  const data = r.result.account_data
  return Number(dropsToXrp(data.Balance)) - 10 - 2 * Number(data.OwnerCount ?? 0)
}

/** Tops `address` up to at least `minXrp` liquid XRP using fresh faucet accounts. Returns the payment hashes. */
export async function ensureLiquid(client: Client, address: string, minXrp: number): Promise<string[]> {
  const hashes: string[] = []
  for (let i = 0; i < 5; i++) {
    if ((await liquidXrp(client, address)) >= minXrp) return hashes
    const { wallet } = await faucetAccount()
    await waitForAccount(client, wallet.classicAddress)
    const res = await client.submitAndWait(
      { TransactionType: 'Payment', Account: wallet.classicAddress, Destination: address, Amount: xrpToDrops(985) },
      { autofill: true, wallet },
    )
    hashes.push(res.result.hash)
  }
  throw new Error(`could not bring ${address} to ${minXrp} XRP liquid`)
}

export const isHash = (s: string) => /^[0-9A-F]{64}$/.test(s)
