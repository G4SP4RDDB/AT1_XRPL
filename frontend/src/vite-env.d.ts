/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_XRPL_WSS: string
  readonly VITE_XRPL_RPC: string
  readonly VITE_XRPL_FAUCET: string
  readonly VITE_XRPL_EXPLORER: string
  readonly VITE_DEMO_LENDER_SEED?: string
  readonly VITE_DEMO_BORROWER_SEED?: string
  readonly VITE_DEMO_BROKER_SEED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
