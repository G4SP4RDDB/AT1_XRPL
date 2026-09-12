import { describe, expect, it, vi } from 'vitest'

vi.mock('xrpl', () => ({ Client: class {} }))

describe('xrpl barrel', () => {
  it('re-exports config and client helpers', async () => {
    const mod = await import('..')
    expect(mod.network).toBeDefined()
    expect(typeof mod.explorerTxUrl).toBe('function')
    expect(typeof mod.explorerAccountUrl).toBe('function')
    expect(typeof mod.getClient).toBe('function')
    expect(typeof mod.disconnectClient).toBe('function')
  })
})
