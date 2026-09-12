import { beforeEach, describe, expect, it, vi } from 'vitest'

// config.ts reads import.meta.env at module load, so every case re-imports a fresh module.
async function loadConfig() {
  vi.resetModules()
  return import('../config')
}

const DEFAULTS = {
  wss: 'wss://lending-hackathon.dev.ripplex.io:51233',
  rpc: 'https://lending-hackathon.dev.ripplex.io:51234',
  faucet: 'https://lending-hackathon-faucet.dev.ripplex.io/accounts',
  explorer: 'https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233',
}

describe('network config', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_XRPL_WSS', undefined)
    vi.stubEnv('VITE_XRPL_RPC', undefined)
    vi.stubEnv('VITE_XRPL_FAUCET', undefined)
    vi.stubEnv('VITE_XRPL_EXPLORER', undefined)
  })

  it('falls back to the Track 1 Custom Hackathon Devnet endpoints when env is unset', async () => {
    const { network } = await loadConfig()
    expect(network).toEqual(DEFAULTS)
  })

  it('uses VITE_XRPL_* env values when provided', async () => {
    vi.stubEnv('VITE_XRPL_WSS', 'wss://example.test:51233')
    vi.stubEnv('VITE_XRPL_RPC', 'https://example.test:51234')
    vi.stubEnv('VITE_XRPL_FAUCET', 'https://faucet.example.test/accounts')
    vi.stubEnv('VITE_XRPL_EXPLORER', 'https://explorer.example.test')

    const { network } = await loadConfig()
    expect(network).toEqual({
      wss: 'wss://example.test:51233',
      rpc: 'https://example.test:51234',
      faucet: 'https://faucet.example.test/accounts',
      explorer: 'https://explorer.example.test',
    })
  })

  it('overrides only the endpoints that are set, keeping defaults for the rest', async () => {
    vi.stubEnv('VITE_XRPL_WSS', 'wss://only-wss.example.test')

    const { network } = await loadConfig()
    expect(network.wss).toBe('wss://only-wss.example.test')
    expect(network.rpc).toBe(DEFAULTS.rpc)
    expect(network.faucet).toBe(DEFAULTS.faucet)
    expect(network.explorer).toBe(DEFAULTS.explorer)
  })

  it('uses secure protocols for the default endpoints', async () => {
    const { network } = await loadConfig()
    expect(network.wss).toMatch(/^wss:\/\//)
    expect(network.rpc).toMatch(/^https:\/\//)
    expect(network.faucet).toMatch(/^https:\/\//)
    expect(network.explorer).toMatch(/^https:\/\//)
  })
})

describe('explorer link helpers', () => {
  it('builds a transaction URL under the configured explorer', async () => {
    const { explorerTxUrl } = await loadConfig()
    const hash = 'A'.repeat(64)
    expect(explorerTxUrl(hash)).toBe(`${DEFAULTS.explorer}/transactions/${hash}`)
  })

  it('builds an account URL under the configured explorer', async () => {
    const { explorerAccountUrl } = await loadConfig()
    expect(explorerAccountUrl('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH')).toBe(
      `${DEFAULTS.explorer}/accounts/rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH`,
    )
  })

  it('follows a custom explorer base from env', async () => {
    vi.stubEnv('VITE_XRPL_EXPLORER', 'https://explorer.example.test')
    const { explorerTxUrl, explorerAccountUrl } = await loadConfig()
    expect(explorerTxUrl('abc')).toBe('https://explorer.example.test/transactions/abc')
    expect(explorerAccountUrl('rXYZ')).toBe('https://explorer.example.test/accounts/rXYZ')
  })
})
