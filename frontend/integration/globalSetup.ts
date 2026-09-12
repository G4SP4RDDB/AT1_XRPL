// Boots what the integration suites need and hands them addresses via provide()/inject().
//   1. Probes the Devnet WebSocket. Unreachable (venue wifi blocks the ledger ports) => suites skip.
//   2. Derives the demo role addresses from the root .env seeds. Seeds never leave this process.
//   3. Makes sure the chain shim answers on VITE_CHAIN_URL, spawning `enforcer` + `serve` from the repo
//      root when nothing is listening (INTEGRATION_SPAWN=0 disables that). Spawned processes are killed at teardown.
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client, Wallet } from 'xrpl'
import type { TestProject } from 'vitest/node'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const WSS = process.env.VITE_XRPL_WSS ?? 'wss://lending-hackathon.dev.ripplex.io:51233'
const CHAIN_URL = process.env.VITE_CHAIN_URL ?? 'http://localhost:8787'
const ENFORCER_URL = process.env.ENFORCER_URL ?? 'http://localhost:8788'

export interface DemoAddresses {
  broker: string
  lender: string
  lender2: string
  borrower: string
}

declare module 'vitest' {
  interface ProvidedContext {
    ledgerReachable: boolean
    chainUrl: string | null
    demo: DemoAddresses | null
    wss: string
  }
}

function readEnv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

function demoAddresses(): DemoAddresses | null {
  const env = readEnv(path.join(ROOT, '.env'))
  const addr = (key: string) => (env[key] ? Wallet.fromSeed(env[key]).classicAddress : undefined)
  const broker = addr('BROKER_SEED')
  const lender = addr('LENDER1_SEED')
  const lender2 = addr('LENDER2_SEED')
  const borrower = addr('BORROWER_SEED')
  if (!broker || !lender || !lender2 || !borrower) return null
  return { broker, lender, lender2, borrower }
}

async function ledgerReachable(): Promise<boolean> {
  const client = new Client(WSS, { connectionTimeout: 10_000 })
  try {
    await client.connect()
    await client.request({ command: 'server_info' })
    return true
  } catch {
    return false
  } finally {
    if (client.isConnected()) await client.disconnect()
  }
}

async function shimUp(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/read/__probe`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(2_000) })
    const body = (await r.json()) as { error?: string }
    return r.status === 404 && typeof body.error === 'string' && body.error.startsWith('unknown route')
  } catch {
    return false
  }
}

async function enforcerUp(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2_000) })
    return r.ok
  } catch {
    return false
  }
}

async function waitFor(check: () => Promise<boolean>, ms: number, what: string): Promise<void> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`timed out waiting for ${what}`)
}

function spawnRoot(script: string, extraEnv: Record<string, string>): ChildProcess {
  const tsx = path.join(ROOT, 'node_modules', '.bin', 'tsx')
  if (!fs.existsSync(tsx)) throw new Error(`integration: ${tsx} missing, run npm install at the repo root`)
  const child = spawn(tsx, [script], { cwd: ROOT, env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
  const tag = path.basename(path.dirname(script)) === 'enforcer' ? 'enforcer' : 'shim'
  child.stdout?.on('data', (d: Buffer) => process.stdout.write(`[${tag}] ${d}`))
  child.stderr?.on('data', (d: Buffer) => process.stderr.write(`[${tag}] ${d}`))
  return child
}

export default async function setup(project: TestProject) {
  const children: ChildProcess[] = []
  const reachable = await ledgerReachable()
  const demo = demoAddresses()
  let chainUrl: string | null = null

  if (!reachable) {
    console.warn(`[integration] Devnet ${WSS} unreachable, ledger and lifecycle suites will be skipped`)
  } else if (!demo) {
    console.warn('[integration] root .env has no demo seeds (run `npm run fund` at the repo root), lifecycle suite will be skipped')
  } else if (await shimUp(CHAIN_URL)) {
    chainUrl = CHAIN_URL
  } else if (process.env.INTEGRATION_SPAWN === '0') {
    console.warn(`[integration] no chain shim at ${CHAIN_URL} and INTEGRATION_SPAWN=0, lifecycle suite will be skipped`)
  } else {
    if (!(await enforcerUp(ENFORCER_URL))) {
      if (!fs.existsSync(path.join(ROOT, '.enforcer.env'))) {
        console.warn('[integration] .enforcer.env missing at the repo root, cannot start the enforcer, lifecycle suite will be skipped')
      } else {
        children.push(spawnRoot('src/chain/enforcer/server.ts', {}))
        await waitFor(() => enforcerUp(ENFORCER_URL), 30_000, `enforcer at ${ENFORCER_URL}`)
      }
    }
    if (await enforcerUp(ENFORCER_URL)) {
      children.push(spawnRoot('src/chain/server.ts', { ENFORCER_URL }))
      await waitFor(() => shimUp(CHAIN_URL), 30_000, `chain shim at ${CHAIN_URL}`)
      chainUrl = CHAIN_URL
    }
  }

  project.provide('ledgerReachable', reachable)
  project.provide('chainUrl', chainUrl)
  project.provide('demo', demo)
  project.provide('wss', WSS)

  return async () => {
    for (const c of children) c.kill('SIGTERM')
    await new Promise((r) => setTimeout(r, 300))
    for (const c of children) if (c.exitCode === null) c.kill('SIGKILL')
  }
}
