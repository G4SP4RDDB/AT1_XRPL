import {
  WalletManager,
  WalletConnectAdapter,
  GemWalletAdapter,
  CrossmarkAdapter,
} from 'xrpl-connect'
import { network } from '@/lib/xrpl'

export const hackathonDevnet = {
  id: 'custom-hackathon-devnet',
  name: 'Custom Hackathon Devnet',
  wss: network.wss,
  rpc: network.rpc,
  walletConnectId: 'xrpl:2',
}

// Real, independent lender/borrower identities: the extension/app holds the key, this app only
// ever sees the public address and a signed blob it hands back (see chain-api.md "prepare/sign").
// GemWallet and Crossmark are browser extensions (no config needed, inert if not installed);
// WalletConnect covers Xaman via QR/deep link. Note: GemWallet/Crossmark must be pointed at this
// custom hackathon devnet's RPC/WSS in their own network settings for signing here to work.
export const walletManager = new WalletManager({
  adapters: [
    new GemWalletAdapter(),
    new CrossmarkAdapter(),
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
