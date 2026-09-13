import { WalletManager, WalletConnectAdapter } from 'xrpl-connect'
import { network } from '@/lib/xrpl'

export const hackathonDevnet = {
  id: 'custom-hackathon-devnet',
  name: 'Custom Hackathon Devnet',
  wss: network.wss,
  rpc: network.rpc,
  walletConnectId: 'xrpl:2',
}

// WalletConnect is the only way in: lenders, borrowers and the platform broker all pair a
// WalletConnect-compatible wallet (Xaman) by QR code / deep link. The app only ever sees the
// public address and the signed blobs it hands back (see chain-api.md "prepare/sign").
// Caveat, measured on 13 Sept: this ledger is a custom network (NetworkID 4001) while
// WalletConnect's CAIP id 'xrpl:2' denotes the public devnet, so a wallet that autofills and
// submits against its own nodes may refuse to sign for it ("request() chainId"). Kept as the single
// entry point by product decision; see README §11.
export const walletManager = new WalletManager({
  adapters: [
    new WalletConnectAdapter({
      projectId: '32798b46e13dfb0049706a524cf132d6',
      useModal: false,
      modalMode: 'never',
      themeMode: 'dark',
      metadata: {
        name: 'AT1 XRPL Platform',
        description: 'AT1 Contingent Convertible Bond Issuance Platform on XRPL',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://xrpl.org',
        icons: ['https://xrpl.org/favicon.ico'],
      },
    }),
  ],
  network: hackathonDevnet as any,
  autoConnect: true,
})
