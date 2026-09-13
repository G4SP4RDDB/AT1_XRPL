# Chain layer API — contract for the frontend

Everything the frontend calls lives in `src/chain/index.ts` and is reachable over HTTP through `src/chain/server.ts`. Types are in `shared/types.ts`. Nothing else in `src/chain/` is public.

## Running it

```bash
npm install
npm run fund:setup  # once: funds the platform broker + enforcer, writes .env and .enforcer.env
npm run enforcer  # the co-signer daemon on http://localhost:8788 (set ENFORCER_URL for the shim)
npm run check     # devnet reachability + amendments (needs a network that allows ports 51233/51234)
npm run serve     # HTTP shim on http://localhost:8787
```

## Calling convention (HTTP)

`POST http://localhost:8787/<group>/<function>` with body `{"args": [ ...positional args ]}`. Response is the function's return value as JSON. Errors: `{"error": "..."}` with status 500, unknown route 404. CORS is open.

```js
const r = await fetch("http://localhost:8787/read/vaultState", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ args: [vaultId] }),
}).then(r => r.json());
```

Every function is real and validated on the devnet (Sat evening, `npm run demo`). Nothing returns fixtures any more.

## Status

| Function | Status | Validated by |
|---|---|---|
| `read.vaultState` | real | demo-flow, hashes below |
| `read.position` | real | demo-flow |
| `read.listVaults` | real | shim smoke test |
| `tx.createBond` | real | B087C9CA2D11, E4846F7483C0, AC939AB1AA2A |
| `tx.prepareDeposit` + `tx.submitSigned` | real | BA2C86E975 (e2e, lender-signed `VaultDeposit`); 9749415B3405 (earlier backend-signed `tx.deposit`, since removed) |
| `tx.originate` | real | 47D2F682B46E |
| `tx.payCoupon` | real | D7351A12A00C |
| `tx.withdraw` | real | F6E477595F2B (yield-only), E5C33914F5FE (full, guardrail rejection) |
| `tx.finalRepayment` | real | `blocked:before-call-date` before the call date (e2e step 9); settles the remaining coupons at the call date (e2e EA805215F3, `tfLoanLatePayment`). 685A52185C45 is the spike run's early close with `tfLoanFullPayment` (0x20000), signed before the call-date policy was wired in |
| `tx.impair` / `tx.unimpair` | real | tecTOO_SOON until a payment is overdue (spike) |

Signatures changed since the stub: `originate` takes the whole `Ask` (the issuer's posted tranche) (with `vaultId` and `loanBrokerId` filled), `payCoupon` and `finalRepayment` take `(loanId, borrowerAddress)`.

## `read` — no signing, safe to call as often as the UI likes

### `read.vaultState(vaultId: string): VaultState`
Live vault figures. The bid terms are read back from the vault's `Data` field and the loan is found through the borrower's owned objects, so nothing is cached off-chain. `pps = (assetsTotal - lossUnrealized) / sharesTotal`. `assetsAvailable` is what withdrawals can actually draw on; `assetsTotal` includes principal out on loan. **Measured on the devnet:** PPS stays 1.0 at origination and rises with each coupon by the interest portion net of the broker fee (5652 drops per coupon on the demo terms), and rises again on an early close because the close penalty is paid into the vault. Expect yield in drops, not XRP, for demo-length loans. On the demo terms a full early close left PPS at 1.0066. `loan` is present once a loan is originated on this vault. `callDate` is the earliest date the final repayment can be co-signed.

### `read.position(address: string, vaultId: string): Position`
One depositor's position. `yieldShares` is the number of shares that can be redeemed without touching principal; it is what `tx.withdraw` in `yield-only` mode redeems. `accruedYield` is `yieldShares * pps` in XRP.

### `read.listVaults(): VaultState[]`
Every vault the platform broker owns, one per bond.

### `read.listAccounts(role?: "borrower" | "lender"): DbAccount[]`
Returns stored client accounts from the SQLite database (`data/accounts.db`), optionally filtered by role (`'borrower'` or `'lender'`).

### `read.getAccount(address: string): DbAccount | null`
Returns the stored client account corresponding to an XRPL classic address.

### `read.isMasterDisabled(address: string): { masterDisabled: boolean }`
Queries the ledger (`account_info`) to check if the account's master key is disabled (`Flags & 0x00100000`). Used by the UI to verify 2-of-2 multisig gating.

## `tx` — each call signs and submits, returns a `TxReceipt`

All receipts carry `hash`, `result` (engine code, `tesSUCCESS` or a `tec*` code), and `explorerUrl`. A non-`tes` result is returned, not thrown: the UI must display it, since guardrail rejections are part of the demo.

### `tx.createBond(ask: Ask): { vaultId, loanBrokerId, receipts }`
Borrower posted an ask. Creates the vault (`VaultCreate`, capped at `bid.amount` so no deposit lands after the bond fills), the broker object (`LoanBrokerSet`) and the first-loss cover (`LoanBrokerCoverDeposit`). Call once per bid, keep the returned ids on the bid.

### `tx.prepareDeposit(lenderAddress, vaultId, amount): Record<string, unknown>` + `tx.submitSigned(signedBlob): TxReceipt`
Lenders are independent accounts — this backend never holds their key. `prepareDeposit` autofills a `VaultDeposit` (`amount` in XRP) and returns the unsigned transaction JSON; the frontend hands it to the lender's own connected wallet and posts the resulting blob to `submitSigned`. Shares are minted at the current PPS. Rejected above the vault cap. **Money in, loan out**: when the deposit brings `assetsAvailable` up to the bid's principal and no loan exists yet, `submitSigned` originates the loan immediately and the receipt carries `autoOrigination: { originated: TxReceipt & { loanId } } | { skipped: reason }` (reasons: partially funded, issuer without 2-of-2 governance, loan already originated).

### `tx.originate(ask: Ask): TxReceipt & { loanId?: string }`
Pass the ask with `vaultId` and `loanBrokerId` set. Broker signs `LoanSet`, the two borrower signers add counterparty signatures, principal moves to the borrower in this same transaction; there is no separate drawdown. Requires `assetsAvailable >= bid.amount`. Store the returned `loanId` on the bid. Loan terms: 3 payments spread to the bid's `callDate` (interval at least 60 s), rate = `yieldRate` percent per year.

### `tx.payCoupon(loanId: string, borrowerAddress: string): TxReceipt | Blocked`
Borrower pays one scheduled `LoanPay`, co-signed by the enforcer. Amount is read from the loan's `periodicPayment`, never chosen by the caller. PPS rises after success (measured: +5401 drops on the demo terms). If the payment is already overdue the call adds `tfLoanLatePayment` and the ledger charges the late fee and late interest on top. `Blocked` if the enforcer refuses (wrong amount, or a late payment without the flag). `{ blocked, reason: "loan already closed" }` once `paymentRemaining` is 0.

### `tx.withdraw(req: WithdrawRequest): TxReceipt` — multisig-active accounts only
`mode: "yield-only"` redeems `position.yieldShares` only. `mode: "full"` redeems every share and is expected to fail with `tecINSUFFICIENT_FUNDS` while principal is out on loan: that is the guardrail demo, show the code. Signed backend-side by the account's operator + enforcer keys (see `tx.prepareAccountMultisigSetup` below) — call only once `read.isMasterDisabled(address)` is true.

### `tx.prepareWithdraw(req: WithdrawRequest): { prepared } | Blocked` + `tx.submitSigned(signedBlob): TxReceipt` — plain accounts
For a depositor who hasn't activated multisig: prepares the `VaultWithdraw`, the frontend signs with the depositor's own connected wallet and posts the blob to `submitSigned`. Same share-selection rules as `tx.withdraw`.

### `tx.repayPrincipal(loanId, borrowerAddress, amountXrp): TxReceipt | Blocked`
`LoanPay` with `tfLoanOverpayment`: the issuer repays part of the principal (an amount covering it all becomes a call). `Blocked: before-call-date` until the ask's call date.

### `tx.finalRepayment(loanId: string, borrowerAddress: string): TxReceipt | Blocked`
Two behaviours, decided by the call date:
- **Before the call date** it is an early close: `LoanPay` with `tfLoanFullPayment`. The enforcer refuses and you get `{ blocked: "before-call-date", reason: "call date in 334s ..." }`, nothing is submitted. (If the enforcer ever co-signed it, the ledger would charge principal + accrued interest + 1 % close rate + 1 XRP fee and take nothing more, measured in the spike.)
- **At or after the call date** the call date is the last scheduled due date, so settling means paying every remaining scheduled coupon, late ones flagged late. The function loops `payCoupon` until `paymentRemaining` is 0 and returns the last receipt. Show progress by re-reading `vaultState` between calls if you want a per-coupon UI.
The one-signature bypass is rejected on-chain with `tefBAD_QUORUM`.

### `tx.impair(loanId)` / `tx.unimpair(loanId): TxReceipt`
Broker marks the loan impaired (`LoanManage`): the vault's `lossUnrealized` rises and PPS drops, the write-down demo. `unimpair` reverses it. **Only accepted once a payment is overdue** (`tecTOO_SOON` before `nextPaymentDueDate`), so the UI flow is: issuer skips a coupon, due date passes, broker impairs.

### `tx.depositCover(loanBrokerId, amount): TxReceipt`
Broker tops up the first-loss cover (`LoanBrokerCoverDeposit`, `amount` in XRP). `tx.createBond` already deposits the initial cover; this is for adding more later.

### `tx.updateAccount({ address, role?, name?, company?, firstName?, userRole?, multisigActive? })`
Writes the onboarding profile of a connected address into the SQLite registry. `read.listAccounts(role?)` / `read.getAccount(address)` read it back; `read.createdAccounts()` lists the faucet-funded spare accounts from `created_accounts.json` with their seeds blanked. `tx.wipeCreatedAccounts()` clears that spare list.

### `tx.prepareAccountMultisigSetup(accountAddress): { signerListSet, disableMaster }` + `tx.submitAccountMultisigSetup(accountAddress, signerListSetBlob, disableMasterBlob): TxReceipt`
Converts a borrower or lender's own account to 2-of-2 multisig governance. The account owner's own connected wallet signs both halves — this backend never holds that account's master key:
1. `prepare` mints (or reuses) an "operator" keypair for this account — held backend-side, since no wallet-connect adapter available today (GemWallet, Crossmark, WalletConnect/Xaman) can produce a multisig-shaped signature — and autofills `SignerListSet` (Quorum 2, entries `[operator, platform enforcer]`) and `AccountSet` (flag 4, `asfDisableMaster`), with the second transaction's `Sequence` bumped past the first.
2. The frontend gets both signed by the account owner's wallet (`walletManager.sign()`), in order.
3. `submit` posts both blobs in order and sets `multisigActive = 1` in the SQLite database once the second lands.

Once active, `tx.payCoupon`/`tx.finalRepayment` (borrower) and `tx.withdraw` (lender) route through this operator key + the platform enforcer automatically — no further signature needed from the account owner for those.

Note: the borrower's operator key is also what counter-signs `LoanSet` (see `tx.originate` above) — `signLoanSetByCounterparty` needs direct private-key access, another thing no wallet-connect adapter supports, so that step stays backend-mediated even for an otherwise fully independent account.

## `profile` — off-chain bank profile registry, no signing

Links an address to a human-readable institution identity (bank name, short code, country,
logo emoji) so the UI shows a bank name instead of a raw address. Stored in
`data/bank-profiles.json` (gitignored, seeded on first run with the four `ROLE_ACCOUNTS`
addresses from `frontend/src/lib/wallet.tsx`). Never touches the ledger; no auth on writes,
which is fine for a hackathon devnet demo but is not a real access-control boundary.

### `profile.get(address: string): BankProfile | null`
Returns `null` if the address has no profile yet.

### `profile.set(input: { address, bankName, shortCode?, country?, logoEmoji? }): BankProfile`
Upsert. Throws if `address` or `bankName` is missing/blank.

### `profile.list(): BankProfile[]`
Every known profile.

## `book` — off-chain ask metadata, no signing

What the ledger cannot hold about a posted bond: `borrowerName`, `description`, `expiresAt` (the funding window, off-chain only). Stored in `data/order-book.json`, keyed by the ask id that is also in the vault's `Data`. The bid / accept / decline mechanism that once lived here was removed on 13 September (funding is a direct `VaultDeposit` from the bond list); see `docs/bank-profiles-and-order-book.md` for the record.

### `book.listAsks(): Ask[]`
### `book.upsertAsk(ask: Ask): Ask`

## Blocked shape

```ts
{ blocked: "before-call-date" | "wrong-amount" | "not-loan-pay", reason: string }
```
Distinguish it from a receipt with `"blocked" in result`. `reason` is human-readable and safe to show.

## Enforcer

The second key of the borrower multisig lives in `.enforcer.env` (gitignored), read only by `src/chain/enforcer/`. It runs as its own process: `npm run enforcer` (port 8788, routes `POST /cosign`, `POST /counter-sign`, `GET /health`), and the shim uses it when started with `ENFORCER_URL=http://localhost:8788 npm run serve`. Without `ENFORCER_URL` the same policy runs in-process, for development only. Policy for `LoanPay`, in order: only loans brokered by this platform; `tfLoanFullPayment` only once ledger time has passed the call date; a coupon's `Amount` must equal `PeriodicPayment + LoanServiceFee` rounded up (or, once overdue, carry `tfLoanLatePayment` with at least that plus the late fee). Policy for `VaultWithdraw` (lender accounts with multisig active, `decideWithdraw`): up to the account's `yieldShares` is co-signed at any time; more than that is co-signed only once the vault's loan is closed (`unauthorized-principal-withdrawal`). Any other transaction type is refused. A refusal returns `Blocked` and nothing reaches the ledger.

## Background: funding-deadline scan

Every 30 s (`DEADLINE_ORIGINATION.scanIntervalSec`) the shim calls `tx.scanStalledOriginations()`: for each vault with no loan whose bid's off-chain `expiresAt` has passed, it originates for whatever was raised if at least 50 % of the principal is in (`originateStalledIfPastDeadline`), otherwise leaves the vault for depositors to withdraw. It never moves depositor funds. Origination (`LoanSet`) is counter-signed only if the `LoanBroker` belongs to the platform and the `Counterparty` is the issuer recorded in the vault's `Data` (`not-issuer` otherwise): a vault lends to its own issuer and nobody else.

## Changes

The chain layer owns `shared/types.ts` and this file; a change to a shape is announced before it lands.

- Lenders and borrowers moved from backend-minted, backend-custodied accounts to independent
  externally-held wallets (WalletConnect / Xaman via `xrpl-connect`). `tx.deposit`,
  `tx.createAccount`, `tx.createRandomAccount`, `tx.registerWallet`, `tx.setupBorrowerMultisig`
  and `tx.setupLenderMultisig` are gone, replaced by the prepare/sign-externally/submit routes
  documented above. See `docs/borrower-lender-custody.md` for the full design and its limits.

---

## Internal modules (chain layer only, not part of the frontend contract)

Listed so anyone picking up `src/chain/` knows what exists. The frontend never imports these.

| Module | Function | Does |
|---|---|---|
| `config.ts` | `NETWORK` | Devnet WSS, RPC, faucet, explorer. Each overridable by `XRPL_WSS`, `XRPL_RPC`, `XRPL_FAUCET`, `XRPL_EXPLORER`. Loads `.env`. |
| | `DEMO_LOAN`, `DEMO_BROKER` | Loan and broker terms for the demo (1000 XRP, 3 × 180 s, 100 % annual, 1 % close rate; 150 XRP cover, 10 % cover ratio, 1 % management fee). |
| | `VAULT_CAP_MARGIN_DROPS`, `SECONDS_PER_YEAR`, `ROLES` | Cap headroom above principal + interest; rate maths; the five role names. |
| `client.ts` | `getClient()` | Shared connected `xrpl.Client`, reconnects if dropped. |
| | `closeClient()` | Disconnect. |
| | `explorerTx(hash)`, `explorerAccount(addr)` | Explorer links for receipts and the README. |
| `accounts.ts` | `fundNewAccount()` | POST to the faucet, returns a `Wallet` with 1000 XRP. Verifies the address matches the seed. |
| | `saveSeed(role, seed)` | Writes `<ROLE>_SEED` into `.env` (mode 600). |
| | `loadAccounts()` | `Record<Role, Wallet>`: requires only `BROKER_SEED` in `.env`. Other roles resolved dynamically from SQLite DB (`data/accounts.db`). |
| | `ensureBalance(client, address, minXrp)` | Tops an account up to `minXrp` liquid (reserve excluded) with fresh faucet accounts paying 985 XRP each. The demo calls it for lender1, broker and borrower before starting. |
| `db/index.ts` | `listAccounts(role?)`, `getAccount(addr)`, `saveAccount(acc)`, `updateAccount(addr, fields)` | SQLite persistence layer (`better-sqlite3`, `data/accounts.db`) storing dynamic borrower and lender records. |
| `ops.ts` | `createBond`, `deposit`, `originate`, `payCoupon`, `finalRepayment`, `withdraw`, `impair`, `unimpair`, `setupBorrowerMultisig`, `createDbAccount` | The real `tx.*` implementations; dynamic borrower operator resolution and multisig configuration. |
| `readLayer.ts` | `vaultStateOf`, `positionOf`, `listVaultsOf` | The real `read.*` implementations, all from the ledger (vault `Data`, `account_objects`, `account_tx`). |
| `loanMath.ts` | `periodicPayment`, `totalInterest`, `percentToTenthBp`, `rippleToIso`, `isoToRipple` | XLS-66 amortisation and time conversions. |
| `enforcer/index.ts` | `cosign(client, prepared, brokerAddress)`, `enforcerWallet()`, `callDateRipple(loan)` | The policy and the second signature; key from `.enforcer.env` only. |
| `tx.ts` | `submit(client, tx, wallet)` | Autofill, sign, submitAndWait. Returns a `Receipt` with the engine result; never throws on tec/tef/tem, the code is in `result`. |
| | `submitMultisigned(client, tx, signers[])` | Autofill with the signer count, each signer signs, `multisign`, submit. Used for every borrower transaction. |
| | `submitBlob(client, blob)` | Submit an already encoded transaction (LoanSet with counterparty signatures). |
| | `createdId(meta, entryType)` | LedgerIndex of the `Vault`, `LoanBroker` or `Loan` a transaction created. |
| `read.ts` | `vaultInfo(client, vaultId)` | `vault_info` flattened: assetsTotal, assetsAvailable, lossUnrealized, assetsMaximum, shareMptId, sharesOutstanding, pps. |
| | `ledgerEntry(client, index)` | Raw `Loan` or `LoanBroker` node by id. |
| | `shareBalance(client, account, mptId)` | Depositor's vault shares from `account_objects` type `mptoken`. |
| | `xrpBalance(client, account)` | Balance in XRP. |
| | `ledgerCloseTime(client)` | Validated ledger close time, ripple epoch seconds, for due-date maths. |
| `server.ts` | HTTP shim | `POST /read/<fn>` and `POST /tx/<fn>` with `{"args": [...]}`. |

### Scripts

| Command | Script | Does |
|---|---|---|
| `npm run check` | `scripts/check-devnet.ts` | Connects, prints rippled version, ledger, reserves, and whether SingleAssetVault and LendingProtocol are enabled. Exit 1 if not. |
| `npm run fund` | `scripts/fund-accounts.ts` | Creates the five roles plus two spares from the faucet, writes seeds to `.env`. |
| `npm run balances` | `scripts/balances.ts` | On-ledger balance, object count and sequence per role. |
| `npm run spike` | `scripts/spike-lifecycle.ts` | S1 + S2: full lifecycle on fresh objects, one row per step, appended to `docs/spike-results.md`. Idempotent for the borrower multisig setup. |
| `npm run serve` | `src/chain/server.ts` | The HTTP shim on :8787. Set `ENFORCER_URL` to use the separate enforcer. |
| `npm run enforcer` | `src/chain/enforcer/server.ts` | The enforcer process on :8788, logs every decision. |
| `npm test` | `tests/*.test.ts` | Unit tests (node:test via tsx), no ledger needed: loan maths, enforcer policy, loan state mapping, result-code parsing, created-object lookup, bid-to-terms. |
| `npm run vaults` | `scripts/vaults.ts` | Every vault the broker owns, through the real read layer. |
| `npm run objects [role]` | `scripts/objects.ts` | Raw count of a role's ledger objects by type, diagnostic. |
| `npm run demo` | `scripts/demo-flow.ts` | Full run through the public API on a fresh bond: create, deposit, originate, guardrail, coupon, yield-only withdraw, gated close. `-- --close` sets the call date 3 minutes out, waits, closes, withdraws everything. |
