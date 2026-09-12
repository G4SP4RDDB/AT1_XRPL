/** Network configuration for Track 1 (Custom Hackathon Devnet). Values come from .env, with CLAUDE.md §2 defaults. */
export const network = {
  wss: import.meta.env.VITE_XRPL_WSS ?? 'wss://lending-hackathon.dev.ripplex.io:51233',
  rpc: import.meta.env.VITE_XRPL_RPC ?? 'https://lending-hackathon.dev.ripplex.io:51234',
  faucet: import.meta.env.VITE_XRPL_FAUCET ?? 'https://lending-hackathon-faucet.dev.ripplex.io/accounts',
  explorer: import.meta.env.VITE_XRPL_EXPLORER ?? 'https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233',
} as const

export const explorerTxUrl = (hash: string) => `${network.explorer}/transactions/${hash}`
export const explorerAccountUrl = (address: string) => `${network.explorer}/accounts/${address}`
