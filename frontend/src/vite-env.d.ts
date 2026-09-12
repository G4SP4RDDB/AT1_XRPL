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

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'xrpl-wallet-connector': any
    }
  }
  namespace React.JSX {
    interface IntrinsicElements {
      'xrpl-wallet-connector': any
    }
  }
}

declare module 'xrpl-connect' {
  export class WalletManager {
    constructor(config: any)
    account: any
    adapters: any[]
    connect(adapterName?: string, options?: any): Promise<any>
    disconnect(): Promise<void>
    sign(tx: any): Promise<any>
    signAndSubmit(tx: any): Promise<any>
    on(event: string, callback: (...args: any[]) => void): void
    off(event: string, callback: (...args: any[]) => void): void
    emit(event: string, ...args: any[]): void
  }
  export class CrossmarkAdapter {
    constructor(options?: any)
  }
  export class GemWalletAdapter {
    constructor(options?: any)
  }
  export class XamanAdapter {
    constructor(options?: any)
  }
  export class WalletConnectAdapter {
    constructor(options?: any)
  }
  export class WalletConnectorElement extends HTMLElement {
    setWalletManager(manager: WalletManager): void
    open(): void
    close(): void
  }
}

