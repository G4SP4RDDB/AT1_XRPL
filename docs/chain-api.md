# Chain layer API — contract for the frontend

Everything the frontend calls lives in `src/chain/index.ts` and is reachable over HTTP through `src/chain/server.ts`. Types are in `shared/types.ts`. Nothing else in `src/chain/` is public.

## Running it

```bash
npm install
npm run fund      # once: creates the role accounts from the faucet, writes .env
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

While a function is a stub, its result carries `stub: true`. Show that in the UI so nobody mistakes fixtures for ledger data.

## Status

| Function | Status | Since |
|---|---|---|
| `read.vaultState` | stub | F4 |
| `read.position` | stub | F4 |
| `read.listVaults` | stub | F4 |
| `tx.createBond` | stub | F4 |
| `tx.deposit` | stub | F4 |
| `tx.originate` | stub | F4 |
| `tx.payCoupon` | stub | F4 |
| `tx.withdraw` | stub | F4 |
| `tx.finalRepayment` | stub (always blocked) | F4 |
| `tx.impair` / `tx.unimpair` | stub | F4 |

## `read` — no signing, safe to call as often as the UI likes

### `read.vaultState(vaultId: string): VaultState`
Live vault figures. `pps = (assetsTotal - lossUnrealized) / sharesTotal`. `assetsAvailable` is what withdrawals can actually draw on; `assetsTotal` includes principal out on loan. **Measured on the devnet:** PPS stays 1.0 at origination and rises with each coupon by the interest portion net of the broker fee (5652 drops per coupon on the demo terms), and rises again on an early close because the close penalty is paid into the vault. Expect yield in drops, not XRP, for demo-length loans. On the demo terms a full early close left PPS at 1.0066. `loan` is present once a loan is originated on this vault. `callDate` is the earliest date the final repayment can be co-signed.

### `read.position(address: string, vaultId: string): Position`
One depositor's position. `yieldShares` is the number of shares that can be redeemed without touching principal; it is what `tx.withdraw` in `yield-only` mode redeems. `accruedYield` is `yieldShares * pps` in XRP.

### `read.listVaults(): VaultState[]`
Every vault the platform broker owns, one per bond.

## `tx` — each call signs and submits, returns a `TxReceipt`

All receipts carry `hash`, `result` (engine code, `tesSUCCESS` or a `tec*` code), and `explorerUrl`. A non-`tes` result is returned, not thrown: the UI must display it, since guardrail rejections are part of the demo.

### `tx.createBond(bid: Bid): { vaultId, loanBrokerId, receipts }`
Borrower posted a bid. Creates the vault (`VaultCreate`, capped at `bid.amount` so no deposit lands after the bond fills), the broker object (`LoanBrokerSet`) and the first-loss cover (`LoanBrokerCoverDeposit`). Call once per bid, keep the returned ids on the bid.

### `tx.deposit(lenderAddress, vaultId, amount): TxReceipt`
Matched ask becomes a real `VaultDeposit`. `amount` in XRP. Shares are minted at the current PPS. Rejected above the vault cap.

### `tx.originate(bidId: string): TxReceipt`
Broker and multisig borrower co-sign `LoanSet`. Principal moves to the borrower in this same transaction; there is no separate drawdown. Requires `assetsAvailable >= bid.amount`.

### `tx.payCoupon(loanId: string): TxReceipt | Blocked`
Borrower pays one scheduled `LoanPay`, co-signed by the enforcer. Amount is read from the loan's `periodicPayment`, never chosen by the caller. PPS rises after success. `Blocked` if the enforcer refuses (wrong amount).

### `tx.withdraw(req: WithdrawRequest): TxReceipt`
`mode: "yield-only"` redeems `position.yieldShares` only. `mode: "full"` redeems every share and is expected to fail with `tecINSUFFICIENT_FUNDS` while principal is out on loan: that is the guardrail demo, show the code.

### `tx.finalRepayment(loanId: string): TxReceipt | Blocked`
`LoanPay` with `tfLoanFullPayment`. Before `callDate` the enforcer refuses and you get `{ blocked: "before-call-date" }`. After it, the receipt. Also demonstrable with one signature only, which the ledger rejects on-chain.

### `tx.impair(loanId)` / `tx.unimpair(loanId): TxReceipt`
Broker marks the loan impaired (`LoanManage`): the vault's `lossUnrealized` rises and PPS drops, the write-down demo. `unimpair` reverses it. **Only accepted once a payment is overdue** (`tecTOO_SOON` before `nextPaymentDueDate`), so the UI flow is: issuer skips a coupon, due date passes, broker impairs.

## Blocked shape

```ts
{ blocked: "before-call-date" | "wrong-amount" | "not-loan-pay", reason: string }
```
Distinguish it from a receipt with `"blocked" in result`.

## Changes

Only Person A edits `shared/types.ts` and this file. A change to a shape is announced in chat before it lands.

---

## Internal modules (Person A only, not part of the frontend contract)

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
| | `loadAccounts()` | `Record<Role, Wallet>` from `.env`; throws naming the missing role. |
| `tx.ts` | `submit(client, tx, wallet)` | Autofill, sign, submitAndWait. Returns a `Receipt` with the engine result; never throws on tec/tef/tem, the code is in `result`. |
| | `submitMultisigned(client, tx, signers[])` | Autofill with the signer count, each signer signs, `multisign`, submit. Used for every borrower transaction. |
| | `submitBlob(client, blob)` | Submit an already encoded transaction (LoanSet with counterparty signatures). |
| | `createdId(meta, entryType)` | LedgerIndex of the `Vault`, `LoanBroker` or `Loan` a transaction created. |
| `read.ts` | `vaultInfo(client, vaultId)` | `vault_info` flattened: assetsTotal, assetsAvailable, lossUnrealized, assetsMaximum, shareMptId, sharesOutstanding, pps. |
| | `ledgerEntry(client, index)` | Raw `Loan` or `LoanBroker` node by id. |
| | `shareBalance(client, account, mptId)` | Depositor's vault shares from `account_objects` type `mptoken`. |
| | `xrpBalance(client, account)` | Balance in XRP. |
| | `ledgerCloseTime(client)` | Validated ledger close time, ripple epoch seconds, for due-date maths. |
| `fixtures.ts` | `vaultFixture`, `positionFixture`, `receiptFixture(tag)` | Stub values returned while a public function is not real yet. |
| `server.ts` | HTTP shim | `POST /read/<fn>` and `POST /tx/<fn>` with `{"args": [...]}`. |

### Scripts

| Command | Script | Does |
|---|---|---|
| `npm run check` | `scripts/check-devnet.ts` | Connects, prints rippled version, ledger, reserves, and whether SingleAssetVault and LendingProtocol are enabled. Exit 1 if not. |
| `npm run fund` | `scripts/fund-accounts.ts` | Creates the five roles plus two spares from the faucet, writes seeds to `.env`. |
| `npm run balances` | `scripts/balances.ts` | On-ledger balance, object count and sequence per role. |
| `npm run spike` | `scripts/spike-lifecycle.ts` | S1 + S2: full lifecycle on fresh objects, one row per step, appended to `docs/spike-results.md`. Idempotent for the borrower multisig setup. |
| `npm run serve` | `src/chain/server.ts` | The HTTP shim on :8787. |
| `npm run demo` | `scripts/demo-flow.ts` | Demo run skeleton; steps are filled as Phase 2 lands. |
