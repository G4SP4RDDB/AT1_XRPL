import { beforeEach, describe, expect, it, vi } from 'vitest'

// A minimal stand-in for xrpl.Client that records calls and tracks connection state.
class FakeClient {
  static instances: FakeClient[] = []
  connected = false
  connect = vi.fn(async () => {
    this.connected = true
  })
  disconnect = vi.fn(async () => {
    this.connected = false
  })
  isConnected = vi.fn(() => this.connected)
  url: string
  constructor(url: string) {
    this.url = url
    FakeClient.instances.push(this)
  }
}

vi.mock('xrpl', () => ({ Client: FakeClient }))

vi.mock('../config', () => ({
  network: { wss: 'wss://mock.test:51233' },
}))

async function loadClientModule() {
  vi.resetModules()
  return import('../client')
}

describe('getClient', () => {
  beforeEach(() => {
    FakeClient.instances = []
  })

  it('creates a Client pointed at the configured WSS endpoint', async () => {
    const { getClient } = await loadClientModule()
    const client = await getClient()

    expect(FakeClient.instances).toHaveLength(1)
    expect(FakeClient.instances[0].url).toBe('wss://mock.test:51233')
    expect(client).toBe(FakeClient.instances[0])
  })

  it('connects on first use', async () => {
    const { getClient } = await loadClientModule()
    const client = (await getClient()) as unknown as FakeClient

    expect(client.connect).toHaveBeenCalledTimes(1)
    expect(client.isConnected()).toBe(true)
  })

  it('returns the same instance and does not reconnect while connected', async () => {
    const { getClient } = await loadClientModule()
    const first = await getClient()
    const second = await getClient()

    expect(second).toBe(first)
    expect(FakeClient.instances).toHaveLength(1)
    expect((first as unknown as FakeClient).connect).toHaveBeenCalledTimes(1)
  })

  it('reconnects the existing instance if the connection dropped', async () => {
    const { getClient } = await loadClientModule()
    const client = (await getClient()) as unknown as FakeClient

    client.connected = false // simulate a WebSocket drop
    const again = await getClient()

    expect(again).toBe(client)
    expect(client.connect).toHaveBeenCalledTimes(2)
    expect(FakeClient.instances).toHaveLength(1)
  })

  it('propagates connection errors and leaves the client disconnected', async () => {
    vi.doMock('xrpl', () => ({
      Client: class extends FakeClient {
        connect = vi.fn(async () => {
          throw new Error('network down')
        })
      },
    }))
    const { getClient } = await loadClientModule()

    await expect(getClient()).rejects.toThrow('network down')
    expect(FakeClient.instances).toHaveLength(1)
    expect(FakeClient.instances[0].isConnected()).toBe(false)

    vi.doMock('xrpl', () => ({ Client: FakeClient }))
  })
})

describe('disconnectClient', () => {
  beforeEach(() => {
    FakeClient.instances = []
  })

  it('is a no-op before any client was created', async () => {
    const { disconnectClient } = await loadClientModule()
    await expect(disconnectClient()).resolves.toBeUndefined()
    expect(FakeClient.instances).toHaveLength(0)
  })

  it('disconnects a connected client', async () => {
    const { getClient, disconnectClient } = await loadClientModule()
    const client = (await getClient()) as unknown as FakeClient

    await disconnectClient()

    expect(client.disconnect).toHaveBeenCalledTimes(1)
    expect(client.isConnected()).toBe(false)
  })

  it('does not call disconnect twice on an already-disconnected client', async () => {
    const { getClient, disconnectClient } = await loadClientModule()
    const client = (await getClient()) as unknown as FakeClient

    await disconnectClient()
    await disconnectClient()

    expect(client.disconnect).toHaveBeenCalledTimes(1)
  })

  it('reconnects the same instance after a disconnect', async () => {
    const { getClient, disconnectClient } = await loadClientModule()
    const client = (await getClient()) as unknown as FakeClient

    await disconnectClient()
    const again = await getClient()

    expect(again).toBe(client)
    expect(client.connect).toHaveBeenCalledTimes(2)
    expect(FakeClient.instances).toHaveLength(1)
  })
})
