import {
  WalletManager,
  WalletConnectAdapter,
} from 'xrpl-connect'
import { network } from '@/lib/xrpl'

export const hackathonDevnet = {
  id: 'custom-hackathon-devnet',
  name: 'Custom Hackathon Devnet',
  wss: network.wss,
  rpc: network.rpc,
  walletConnectId: 'xrpl:2',
}

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
