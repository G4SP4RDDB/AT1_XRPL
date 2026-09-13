# Lender/borrower custody: independent wallets, not backend-minted accounts

## What changed

Before this change, every lender and borrower account was minted and custodied by this backend:
`createDbAccount`/`createRandomAccount` asked the Devnet faucet for a fresh account, kept its seed
in `data/accounts.db`, and `walletFor(address)` signed on the user's behalf for every transaction
(`VaultDeposit`, `VaultWithdraw`, the account's own multisig setup). "Connecting a wallet" in the
UI meant picking one of these backend-held identities — never proving ownership of a key.

Now:
- Lenders and borrowers fund their own accounts (`npm run create-accounts` at the repo root, then
  import the printed seed into a real wallet — Xaman, GemWallet, or Crossmark).
- The app connects to that real wallet via `xrpl-connect` (`frontend/src/lib/xrplConnect.ts`,
  adapters: GemWallet, Crossmark, WalletConnect for Xaman). The backend only ever learns the
  connected wallet's public address.
- The first time a new address connects, the existing mandatory onboarding flow
  (`BorrowerOnboardingModal`) has it pick lender or borrower and writes that to `accounts.db` —
  the same DB row as before, just never seeded with a private key.
- Every transaction that needs that account's signature is split into **prepare** (backend
  autofills the transaction JSON, never signs it) → **sign** (the frontend hands it to the
  connected wallet via `walletManager.sign()`) → **submit** (the backend takes the signed blob and
  posts it to the ledger). See `docs/chain-api.md` for the exact routes
  (`tx.prepareDeposit`/`tx.submitSigned`, `tx.prepareWithdraw`, `tx.prepareAccountMultisigSetup`/
  `tx.submitAccountMultisigSetup`).

## What's still backend-mediated, and why

Two things could not move to the user's own wallet, and it isn't for lack of effort — it's a real
gap in the wallet-connect tooling available for this hackathon (`xrpl-connect` v0.8.2, adapters
for GemWallet, Crossmark, Xaman/WalletConnect):

1. **The account's own multisig "operator" key.** Once an account converts to 2-of-2 multisig
   (`SignerListSet` + `AccountSet asfDisableMaster`), every future authorization from that account
   must come from a key in its `SignerEntries`, encoded as a `Signers` array
   (`encodeForMultisigning`/`multisign()` in xrpl.js). None of the available adapters expose any
   way to produce that shape of signature — they only sign a plain, single-signer transaction.
   Multisig signing requires direct access to a raw private key via xrpl.js's `Wallet` class,
   which is exactly what a real wallet extension is designed to never hand over to a dApp.
   **Consequence:** the operator key that sits in the account's own `SignerList` (alongside the
   platform enforcer) is generated and held by this backend, not the account owner. What *is* now
   owner-controlled is the *conversion itself* — the account owner's own wallet signs the one-time
   `SignerListSet`/`AccountSet` pair that installs this arrangement (see
   `prepareAccountMultisigSetup`/`submitAccountMultisigSetup` in `src/chain/ops.ts`), so the
   backend can no longer flip an account to multisig without that account's consent, even though
   it still holds the ongoing cosigning key.

2. **`LoanSet`'s `CounterpartySignature`.** XLS-66's `LoanSet` has the borrower add its own
   signature over the same transaction the broker signs, via `signLoanSetByCounterparty()`. That
   helper also requires a raw private key (`computeSignature(tx, wallet.privateKey, …)`) — no
   adapter exposes an equivalent. **Consequence:** loan origination still counter-signs with the
   borrower's backend-held operator key (the same key from point 1), not the user's real wallet.

Both are documented as explicit SDK-gap findings in this project's DevEx feedback report, with a
proposed fix: an adapter-level primitive (or a documented recipe) for multisig-shaped signing and
for `CounterpartySignature` would let a lending-protocol app built this way go fully non-custodial
for these two roles as well.

## What is fully independent today

- Initial connection and identity (no backend-minted account, no fixed demo address for lender/
  borrower — only the platform broker keeps one, since it's the platform's own fixed identity).
- `VaultDeposit` (funding a bond) — signed entirely by the lender's own wallet.
- A plain (pre-multisig) `VaultWithdraw` — signed entirely by the depositor's own wallet.
- The *decision* to activate multisig, and the transactions that do so — signed by the account
  owner's own wallet, even though the resulting operator key is backend-held (see above).

## Practical note for testing

WalletConnect (Xaman) is the only connection method offered by the UI. This ledger is a custom
network (NetworkID 4001) while WalletConnect's CAIP id `xrpl:2` denotes the public devnet, so a
wallet that autofills and submits against its own nodes may refuse to sign for it
(`request() chainId`); that is outside this app's control. GemWallet / Crossmark adapters and a
local seed adapter were tried during the hackathon and removed by product decision.
