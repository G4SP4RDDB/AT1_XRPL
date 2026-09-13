# Full pipeline verification — 2026-09-12

Everything below ran against the real custom hackathon devnet (rippled 3.4.0-rc1, SingleAssetVault +
LendingProtocol + LendingProtocolV1_1 + fixCleanup3_4_0 enabled), through four independent layers, so a bug
in any one layer's assumptions would be caught by another. All four are green.

## 1. Unit tests (no ledger)

| Suite | Command | Result |
|---|---|---|
| Backend (loan maths, enforcer policy, read mapping, bid terms) | `npm test` | **39/39 pass** (24 at the time of the 12 September run; bid-terms, enforcer counter-sign and order-book accept/decline tests added since) |
| Frontend (wallet, xrpl config/client, App) | `cd frontend && npm test` | **22/22 pass** (19 at the time of the 12 September run; role-access tests added since), no flake |

## 2. Full lifecycle through the public API — `npm run e2e` (`scripts/e2e-full.ts`)

One bond, top to bottom, calling the exact same functions the chain shim exposes to the frontend
(`src/chain/index.ts`), plus the deliberately-invalid transactions no legitimate caller would ever build,
submitted straight against the ledger to prove the guardrails hold rather than trusting application code.
**17/17 steps matched expectation** (re-run 13 September with wallet-onboarded accounts: origination now happens automatically on the funding deposit, and a LoanSet for a foreign counterparty is refused by the issuer binding). Full table with every transaction hash: `docs/e2e-full-report.md`.

Covers, in order: vault creation (VaultCreate + LoanBrokerSet + cover deposit) · deposit · **multisig proof
1** — a payment signed by the borrower's disabled master key is rejected (`tefMASTER_DISABLED`) · origination
(LoanSet with a 2-of-2 multisig counterparty signature) · **write-down precondition** — impairing before any
coupon is overdue is refused (`tecTOO_SOON`) · **liquidity guardrail** — a full withdrawal while principal is
on loan is refused (`tecINSUFFICIENT_FUNDS`) · **enforcer gate** — an early close with 3 payments still
remaining is refused before the caller ever reaches the ledger · **multisig proof 2** — a coupon signed by
only one of the two required signers is rejected (`tefBAD_QUORUM`) · **write-down** — once the coupon is
genuinely overdue, impair succeeds (`lossUnrealized` rises, PPS drops), then unimpair restores it · the
overdue coupon is paid (late-flagged automatically), PPS rises, yield accrues · yield-only withdrawal leaves
the principal shares in place · **debt reimbursement** — at the call date, with 2 payments still scheduled,
`finalRepayment` pays the remaining coupons one by one (late-flagged, `tfLoanLatePayment`), the last one closes the
loan on the ledger and the coupon interest lifts PPS again; `tfLoanFullPayment` is never used here because it only
means an early close, which the enforcer refuses before the call date (step 9) · final withdrawal returns principal plus every accrued increment of yield.

One test-script bug found and fixed along the way, not a product bug: the first run placed the
"impair before due" check after two other on-chain submissions (each several real seconds via
`submitAndWait`), which pushed it past the loan's 60-second minimum interval by the time it ran — so it
correctly succeeded instead of returning `tecTOO_SOON`, and the reordering below fixed the false read:

> **Lesson for demo pacing**: the protocol's payment interval floor is 60 seconds, and a single
> `submitAndWait` round trip on this devnet can itself take several seconds. Anything timed against a due
> date needs to check it before spending that budget on unrelated transactions, or account for the elapsed
> time explicitly. Confirmed by rerunning the same step first, immediately after origination, in isolation:
> a clean `tecTOO_SOON`.

## 3. Frontend integration suite, independent implementation — `cd frontend && npm run test:integration[:close]`

A second harness, written independently of `e2e-full.ts`, driving the same lifecycle through the browser's
own `@shared/chainClient` over real HTTP to the shim (not a direct import), plus a suite of direct-ledger
checks (connection, amendments, faucet, `vault_info`).

| Run | Result |
|---|---|
| `test:integration` (no settlement wait) | **16 passed, 1 skipped** (the settlement block, gated by `INTEGRATION_CLOSE`) |
| `test:integration:close` (full settlement) | **17/17 pass**, including `finalRepayment` at the call date and the final withdrawal |

## What this rules out

- The multisig gate is not cosmetic: both a master-key bypass and a one-signature bypass are rejected by the
  ledger itself, not by application logic that a client could skip.
- The write-down precondition (must be overdue) and the write-down mechanism itself (impair/unimpair, PPS
  and `lossUnrealized` moving correctly) both work, confirmed twice: in isolation and inside the full run.
- The early-close "debt reimbursement" path — the actual mechanism that lets an issuer settle before every
  coupon is paid — works end to end, including the penalty landing in the vault where lenders benefit from it.
- Two structurally different clients (a direct backend script and the frontend's HTTP client) agree on every
  observable: PPS, share counts, result codes, hashes. The shim and the enforcer process are not just
  reachable, they produce identical outcomes to calling the backend directly.

## Processes left running for continued manual testing

```
npm run enforcer                                          # :8788
ENFORCER_URL=http://localhost:8788 npm run serve          # :8787
```
Stop with `pkill -f "tsx src/chain/enforcer/server.ts"; pkill -f "tsx src/chain/server.ts"`.
