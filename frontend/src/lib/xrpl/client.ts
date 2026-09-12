import { Client } from 'xrpl'
import { network } from './config'

let client: Client | undefined

/** Shared, lazily-connected xrpl.js client for the Devnet WebSocket endpoint. */
export async function getClient(): Promise<Client> {
  if (!client) client = new Client(network.wss)
  if (!client.isConnected()) await client.connect()
  return client
}

export async function disconnectClient(): Promise<void> {
  if (client?.isConnected()) await client.disconnect()
}
