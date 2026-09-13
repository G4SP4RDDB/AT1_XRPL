import { WalletManager, WalletConnectAdapter } from 'xrpl-connect'
import { encode } from 'xrpl'
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
  // Off: for WalletConnect, auto-reconnect just opens a new pairing proposal that nobody can
  // approve without the QR code; the user re-pairs explicitly after a reload.
  autoConnect: false,
})

/** Chain ids (CAIP-2, e.g. "xrpl:1") the wallet actually approved for the live session. */
function approvedChains(adapter: any): string[] {
  const accounts: string[] = adapter?.session?.namespaces?.xrpl?.accounts ?? []
  return Array.from(new Set(accounts.map((a) => a.split(':').slice(0, 2).join(':'))))
}

/**
 * Sign an already-autofilled transaction through the WalletConnect session and return a
 * submittable blob. Two things xrpl-connect 0.8.2 gets wrong for this network are handled here:
 *  - it tags every request with the network's `walletConnectId` ("xrpl:2"); WalletConnect v2 lets
 *    the wallet approve only the chains it supports, so the request is rejected client-side with
 *    "Missing or invalid. request() chainId: xrpl:2". We use a chain the wallet did approve.
 *  - its sign() returns tx_json.TxnSignature as `tx_blob` (the bare signature, not a serialized
 *    transaction). We ask for the signed tx_json and encode it ourselves.
 * The shim autofilled Sequence / Fee / LastLedgerSequence / NetworkID (4001) for this ledger, so the
 * wallet is asked not to autofill again.
 */
export async function signPrepared(prepared: Record<string, unknown>): Promise<{ tx_blob: string; hash?: string }> {
  const adapter: any = (walletManager as any).wallet
  if (!adapter || adapter.id !== 'walletconnect' || !adapter.client || !adapter.session) {
    throw new Error('Aucune session WalletConnect active — reconnectez votre wallet.')
  }
  const approved = approvedChains(adapter)
  const wanted = hackathonDevnet.walletConnectId
  const chainId = approved.includes(wanted) ? wanted : approved[0] ?? wanted
  if (chainId !== wanted) {
    console.warn(`[walletconnect] session approved ${approved.join(', ') || 'no chain'}; signing with ${chainId} instead of ${wanted}`)
    // Keep the adapter's own sign()/signAndSubmit() usable too.
    if (adapter.currentAccount?.network) adapter.currentAccount.network.walletConnectId = chainId
  }
  const result: any = await adapter.client.request({
    topic: adapter.session.topic,
    chainId,
    request: { method: 'xrpl_signTransaction', params: { tx_json: prepared, autofill: false, submit: false } },
  })
  const txJson = result?.tx_json ?? result
  if (!txJson?.TxnSignature || !txJson?.SigningPubKey) {
    throw new Error(`Le wallet n'a pas renvoyé de transaction signée (${JSON.stringify(result).slice(0, 200)})`)
  }
  return { tx_blob: encode(txJson), hash: txJson.hash }
}
