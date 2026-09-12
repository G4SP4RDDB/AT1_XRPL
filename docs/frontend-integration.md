# Frontend integration scaffold

Everything the UI needs to talk to the chain layer, with the call sequence per screen and real response samples from the devnet. The frontend never holds a seed and never opens a WebSocket to the ledger: it calls the shim, and the shim signs with the keys on Person A's machine.

## 1. Run it

Terminal 1 and 2, repo root (Person A's side, or any machine with the `.env`):
```bash
npm install
npm run enforcer                                        # the platform's co-signer, http://localhost:8788
ENFORCER_URL=http://localhost:8788 npm run serve        # chain shim on http://localhost:8787
```
Terminal 2, `frontend/`:
```bash
echo 'VITE_CHAIN_URL=http://localhost:8787' >> .env
npm run dev
```
The ledger ports are blocked on the venue wifi; the machine running the shim must be on a hotspot. The browser only needs the shim, so the UI works on any network. The explorer links in receipts open pages that need the ledger port too, so they will not load on venue wifi.

Drop the direct `xrpl` client from `frontend/src/lib/xrpl/`: nothing in the UI should sign or query the ledger. `VITE_DEMO_*_SEED` variables are not needed and should stay empty.

## 2. The client

`shared/chainClient.ts` (owned by Person A, import it, do not copy it):
```ts
import { createChainClient, isBlocked, isSuccess } from "../../shared/chainClient";
import type { Bid, Ask, VaultState, Position } from "../../shared/types";

export const chain = createChainClient(import.meta.env.VITE_CHAIN_URL ?? "http://localhost:8787");
```
Every `tx.*` call resolves to a `TxReceipt` (`hash`, `result`, `explorerUrl`) or, for borrower actions, a `Blocked` (`blocked`, `reason`). Neither is thrown. A `ChainError` is thrown only for transport problems or an unknown route. A `result` other than `tesSUCCESS` is a ledger rejection and must be shown, not hidden: the guardrail demo is one of them.

```ts
const r = await chain.tx.finalRepayment(bid.loanId!, bid.borrowerAddress);
if (isBlocked(r)) toast(`Refused: ${r.reason}`);          // enforcer said no, nothing was submitted
else if (isSuccess(r)) toast(`Settled, ${r.hash.slice(0, 8)}`);
else toast(`Ledger rejected: ${r.result}`);               // e.g. tecINSUFFICIENT_FUNDS
```

## 3. Demo accounts

Seeds live only in the root `.env`. The UI works with addresses.

| Role | Address | Use in the UI |
|---|---|---|
| broker (platform) | `r4r59gviPCnToSNThhHk9qetUwfNc7Rt2N` | owner of every vault; impair / unimpair |
| borrower (issuer, 2-of-2 multisig) | `rsnFbojcDMuFmC7f3Ws7PdsvzSuA71RTgT` | `Bid.borrowerAddress` |
| lender1 | `rD8F37f4XEpNMfCmSUDerZiSBSG8rD1QzZ` | `Ask.lenderAddress`, deposits, withdrawals |
| lender2 | `rsn5ZUPZWQmtqDfDCnBrGf3bdkJNQCkDcW` | second lender for the ask board |
| borrower-op, enforcer | signer seats | never appear in the UI |

A wallet picker can simply offer lender1, lender2 and borrower. Wallet-connect is not needed for the demo.

## 4. Screens and their calls

### Bid board (borrower)
1. Borrower fills amount, yield (percent per year), call date. Keep the `Bid` in local state, `status: "open"`.
2. On post: `const { vaultId, loanBrokerId, receipts } = await chain.tx.createBond(bid)`; store both ids on the bid. Three receipts come back (VaultCreate, LoanBrokerSet, cover deposit), show the first hash. Takes about 12 s (three validated transactions).
3. The bid is now "open" with a live vault: `chain.read.vaultState(vaultId)` shows `assetsTotal: "0"`.

### Ask board and match (lender)
1. Lender posts an `Ask` (amount, `indicated: true`). Pure local state, nothing on-chain.
2. Match rule for the demo: same amount and ask yield <= bid yield. On match, set `ask.matchedBidId`, `bid.status = "matched"`.
3. Deposit: `await chain.tx.deposit(ask.lenderAddress, bid.vaultId, ask.amount)` (about 4 s). Then `read.position(lender, vaultId)` shows `shares` equal to the deposit in drops, `pps: 1`.
4. Originate: `const o = await chain.tx.originate(bid)`; store `o.loanId`, `bid.status = "originated"`. `vaultState.loan` now exists, `assetsAvailable` is `"0"`, and `callDate` comes from the loan.

### Depositor dashboard (lender)
Poll `read.vaultState(vaultId)` and `read.position(address, vaultId)` every 5 s while a loan is active (each read is 2 to 4 ledger requests, cheap).
- PPS card: `vaultState.pps` (starts at 1, rises with each coupon).
- Accrued yield: `position.accruedYield` in XRP; on the demo terms it is a few thousand drops, so show 6 decimals or drops.
- Liquidity bar: `assetsAvailable / assetsTotal` (0 right after origination, refills per coupon).
- Call-date countdown: `vaultState.callDate` (ISO).
- "Withdraw yield" button: `chain.tx.withdraw({ depositorAddress, vaultId, mode: "yield-only" })`. Disabled when `position.yieldShares === "0"`.
- "Withdraw all" button: `mode: "full"`. While the loan is active this returns `result: "tecINSUFFICIENT_FUNDS"`: show it with the explanation "principal is out on loan until the call date". That is the guardrail demo.

### Issuer panel (borrower)
- "Pay coupon": `chain.tx.payCoupon(loanId, borrowerAddress)`. Amount is decided by the ledger, not the UI. Show `loan.periodicPayment`, `loan.nextPaymentDueDate`, `loan.paymentRemaining` from `vaultState.loan`.
- "Repay / call the bond": `chain.tx.finalRepayment(loanId, borrowerAddress)`. Before the call date: `Blocked` with `reason` like `call date in 334s`. Show it as "enforcer refused". At or after the call date it pays the remaining schedule and returns the last receipt; re-read `vaultState` and the loan is `status: "closed"`.

### Broker panel (platform)
- "Impair": `chain.tx.impair(loanId)`. Accepted only once a coupon is overdue (`result: "tecTOO_SOON"` before). After it `vaultState.lossUnrealized > 0` and `pps` drops on every dashboard: the write-down demo. "Unimpair" reverses it.
- Sequence for the demo: issuer skips a coupon, wait for `nextPaymentDueDate` to pass, impair, show the PPS drop, unimpair.

## 5. Response samples (real, devnet, 2026-09-12)

`read.vaultState` right after origination:
```json
{"vaultId":"90361FA86AE25C87988E0FAD2B508B3AB0AC1107424112A20E2F94D4D3A490AD","asset":"XRP","assetsTotal":"1000","assetsAvailable":"0","lossUnrealized":"0","sharesTotal":"1000000000","pps":1,"callDate":"2026-09-12T17:02:27.000Z","loan":{"loanId":"6E739EAB19...","principalOutstanding":"1000","totalValueOutstanding":"1000.011416","periodicPayment":"333.337139","nextPaymentDueDate":"2026-09-12T16:56:43.000Z","paymentRemaining":3,"status":"active"}}
```
`read.position` after one coupon:
```json
{"depositorAddress":"rD8F37f4XEpNMfCmSUDerZiSBSG8rD1QzZ","vaultId":"9036...","shares":"1000000000","principalDeposited":"1000","currentValue":"1000.005401","accruedYield":"0.005401","yieldShares":"5400"}
```
`tx.withdraw` full while lent (guardrail):
```json
{"hash":"E5C33914F5FE...","result":"tecINSUFFICIENT_FUNDS","explorerUrl":"https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/E5C3..."}
```
`tx.finalRepayment` before the call date:
```json
{"blocked":"before-call-date","reason":"call date in 334s (ledger time 842547241, call 842547575)"}
```
`tx.createBond`:
```json
{"vaultId":"9036...","loanBrokerId":"B5A3...","receipts":[{"hash":"B087...","result":"tesSUCCESS","explorerUrl":"..."},{"hash":"E484...","result":"tesSUCCESS","explorerUrl":"..."},{"hash":"AC93...","result":"tesSUCCESS","explorerUrl":"..."}]}
```

## 6. Timing to design around
- A validated transaction takes 3 to 5 s; `createBond` is three of them, `originate` one, `finalRepayment` after the call date up to three.
- Demo loans use 3 payments spread to the call date, minimum 60 s apart. A 9-minute call date gives 180 s intervals. Coupons can be paid early, back to back.
- Yield on 1000 XRP over minutes is thousands of drops, not XRP. Format with 6 decimals.
- Disable the button while a call is in flight; the shim processes calls sequentially per account (the ledger sequence number requires it).

## 7. What is deliberately off-chain
Bids, asks and the match. Store them in React state or localStorage; the vault's `Data` field carries the bid terms so `vaultState.callDate` works even before origination.
