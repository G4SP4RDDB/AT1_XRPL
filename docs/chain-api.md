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
Live vault figures. `pps = (assetsTotal - lossUnrealized) / sharesTotal`. `assetsAvailable` is what withdrawals can actually draw on; `assetsTotal` includes principal out on loan **and the whole expected interest, booked at origination**. So PPS jumps when the loan is originated and stays flat through coupons; coupons raise `assetsAvailable` instead. Expect yield in drops, not XRP, for demo-length loans. `loan` is present once a loan is originated on this vault. `callDate` is the earliest date the final repayment can be co-signed.

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
Broker marks the loan impaired (`LoanManage`): the vault's `lossUnrealized` rises and PPS drops, the write-down demo. `unimpair` reverses it.

## Blocked shape

```ts
{ blocked: "before-call-date" | "wrong-amount" | "not-loan-pay", reason: string }
```
Distinguish it from a receipt with `"blocked" in result`.

## Changes

Only Person A edits `shared/types.ts` and this file. A change to a shape is announced in chat before it lands.
