import { Client } from "xrpl";
import { NETWORK } from "./config.js";

let client: Client | undefined;

/** Shared connected client. Reconnects if the socket dropped. */
export async function getClient(): Promise<Client> {
  if (!client) {
    client = new Client(NETWORK.wss, { connectionTimeout: 20_000 });
    client.on("disconnected", (code) => console.error(`[client] disconnected (${code})`));
  }
  if (!client.isConnected()) await client.connect();
  return client;
}

export async function closeClient(): Promise<void> {
  if (client?.isConnected()) await client.disconnect();
}

export const explorerTx = (hash: string) => `${NETWORK.explorer}/transactions/${hash}`;
export const explorerAccount = (addr: string) => `${NETWORK.explorer}/accounts/${addr}`;
