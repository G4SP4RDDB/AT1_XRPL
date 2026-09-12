# AT1 on XRPL — complete dev pipeline

Master plan for the whole build, from empty repo to submission. Written from Person A's seat (on-chain settlement layer) but covering both layers so it can be cut into subplans. Companion docs: `CLAUDE.md` (architecture, why), `two_person_split.md` (who owns what).

Status legend used below: **A** = Person A (chain), **B** = Person B (frontend), **AB** = both together.

---

## 0. Ground truth that overrides CLAUDE.md

Verified against the installed SDK (`xrpl@5.2.0`, the current stable release) and the workshop slides. These change the plan, so they come first.

| CLAUDE.md says | Reality | Consequence |
|---|---|---|
| `xrpl ^3.x` | 3.x ends at 3.1.0 and has no XLS-65/66 types. Stable is 5.2.0 and ships every vault and loan transaction. | Installed 5.2.0. Update CLAUDE.md §11. |
| `LoanDraw` is a separate drawdown step | No such transaction. Principal moves to the borrower when `LoanSet` is validated. | "Drawdown" = `LoanSet` finalization. `chain/src/loan/drawdown.ts` is not needed. |
| Final repayment is "the LoanPay that clears the loan" | It is `LoanPay` with flag `tfLoanFullPayment`. Coupons are plain `LoanPay`. | The multisig gate targets exactly that flagged transaction. |
| Multisig gate sits "on the final repayment transaction" | `LoanPay` must be signed by the loan's `Borrower` account. There is no per-transaction signer list. | The **borrower account itself** must be multisig-controlled (`SignerListSet` + master key disabled). Coupons are also co-signed, which is fine for the demo. |
| `LoanSet` is "co-signed by broker + borrower" | `LoanSet` is submitted by the broker with `Counterparty` = borrower and a `CounterpartySignature` that may carry a `Signers[]` array. The SDK ships `signLoanSetByCounterparty` and `combineLoanSetCounterpartySigners`. | A multisig borrower can counter-sign origination natively. This is the exact path to spike. |
| Read PPS, AssetsTotal, loan status | `vault_info` RPC returns the vault plus its share MPT issuance (`OutstandingAmount` = SharesTotal). `Loan` and `LoanBroker` are ledger entries fetched by ID. `AssetsAvailable` is the liquid part, `AssetsTotal` includes principal out on loan, `LossUnrealized` is set while a loan is impaired. | PPS = (AssetsTotal - LossUnrealized) / shares.OutstandingAmount. Liquidity guardrail is driven by AssetsAvailable. |
| Principal is "locked" while capital is out on loan | Only while `AssetsAvailable` is near zero. Every coupon and every later deposit refills it, and withdrawals are first come first served. A depositor can pull principal out of coupon liquidity. | Create each bond vault with `AssetsMaximum` = bid amount so no deposit lands after the bond fills. Yield-only withdrawal stays an app convention; say so in the report. |

### Verified against the XLS-65 / XLS-66 specs (Sat evening)

| Question | Spec answer | Consequence |
|---|---|---|
| Can a multisig borrower counter-sign `LoanSet`? | Yes. `CounterpartySignature` accepts a `Signers` array (XLS-66 §3.8.1.1). Fee = (1 + tx.Signers + counterparty signatures) x base fee. | S1 Q1 becomes a confirmation run, not an open question. |
| Is early full repayment allowed? | Yes, with `tfLoanFullPayment`, cost = principal + accrued interest + `CloseInterestRate` x principal + `ClosePaymentFee` (§6.1). Refused only when `PaymentRemaining == 1` (`tecKILLED`). | S1 Q2 becomes a cost measurement. The enforcer gate is needed. |
| Can a coupon be paid before its due date? | Yes. A payment is "on time" while `currentTime < NextPaymentDueDate`; only late ones need `tfLoanLatePayment`, otherwise `tecEXPIRED` (§3.11.4.2 item 11). | The demo can pay all coupons back to back. No waiting per interval. |
| What does the liquidity guardrail return? | `tecINSUFFICIENT_FUNDS` when `AssetsAvailable` is below the withdrawal (XLS-65 §3.6.2.2 item 10). | S2 measures whether that code is self-explanatory; the code itself is known. |
| Who sends `LoanBrokerSet`? | The vault `Owner`, else `tecNO_PERMISSION` (§3.3.3.2). | Broker = vault owner, confirmed. |
| When does PPS rise? | Spec §3.8.6 item 6 says `LoanSet` adds the whole `InterestDue` to `AssetsTotal`. **The devnet does not do that**: after LoanSet `AssetsTotal` stayed 1000000000 and PPS 1.0; after the first coupon `AssetsTotal` rose by the interest portion net of the 1 % fee (5652 drops) and PPS with it. | The original "PPS rises with each coupon" story holds on this ledger. The spec text and the implementation disagree: headline doc finding, with hashes 9049D4BC738E (LoanSet) and 4434E33720D1 (coupon). |
| Does `AssetsMaximum` = bid amount work? | No. `LoanSet` fails with `tecLIMIT_EXCEEDED` if `AssetsTotal >= AssetsMaximum` or `AssetsTotal + InterestDue > AssetsMaximum` (§3.8.5.2 items 6 and 14). `VaultSet` cannot lower the cap below `AssetsTotal`. | Cap = principal + interestDue + margin, computed client side with the §1.1 / §2.1 formulas. |
| Rate units and term limits | Rates are 1/10 basis point (100000 = 100 %). `PaymentInterval >= 60 s`, `60 s <= GracePeriod <= PaymentInterval`. `ManagementFeeRate <= 10000`. | Config fixed. A minutes-long loan at 100 % earns about 0.017 XRP on 1000 XRP: show yield in drops. |
| Extra payment amount | Only `totalDue` is taken; a larger `Amount` is not an overpayment unless `tfLoanOverpayment` is set (A-3.2.1). Less than due: `tecINSUFFICIENT_PAYMENT`. | Enforcer checks `Amount == PeriodicPayment + LoanServiceFee` from the `Loan` entry. |

Also verified: `LoanManage` with `tfLoanImpair` (broker only) marks the loan impaired and sets `LossUnrealized` on the vault, so PPS drops on screen. `tfLoanUnimpair` reverses it. **On this devnet `fixCleanup3_4_0` is active**, so impair is refused with `tecTOO_SOON` until `currentTime > NextPaymentDueDate`: the issuer must actually miss a coupon first. That is a better AT1 demo (missed coupon, then write-down) and costs one `PaymentInterval` of waiting, 180 s.

Also measured: an early close with `CloseInterestRate` 1 % cost the borrower principal + 1 % + 1 XRP fee (674.34 XRP on 666.67 outstanding), and the 1 % went **to the vault**, PPS 1.0066 after close. `CloseInterestRate` is therefore a ledger-enforced economic lock: set it at or above the remaining coupon interest and an early close never costs the lenders anything. The enforcer is the hard gate; this is the soft one. Both go in the report.

Also verified: `LoanSet` fields `InterestRate`, `PaymentInterval`, `PaymentTotal`, `GracePeriod`, `CloseInterestRate`, `ClosePaymentFee`. `LoanBrokerSet` fields `ManagementFeeRate`, `DebtMaximum`, `CoverRateMinimum`, `CoverRateLiquidation`. Broker first-loss capital goes in through `LoanBrokerCoverDeposit`.

---

## 1. Clock

Wall clock, not the "hour N" markers in `two_person_split.md` (those assume 36 continuous hours; real on-site time is about 14 hours).

| Window | When | Focus |
|---|---|---|
| W1 | Sat 17:00 to 18:30 | Foundations: env, accounts, shared types, spike scripts running |
| W2 | Sat 18:30 to 21:00 | Spikes resolved, vault + broker + deposit working, read-layer stub for B |
| W3 | Sat 21:00 to Sun 08:30, remote, optional | Origination, coupon, yield withdrawal, first integration |
| W4 | Sun 08:30 to 11:00 | Multisig-gated final repayment, guardrail demo, full end-to-end run, tx links |
| W5 | Sun 11:00 to 12:30 | Freeze. Report, README, slides, demo rehearsal |
| W6 | Sun 12:30 to 13:00 | Submission buffer only |

Rule: if W4 starts without a green end-to-end run from W3, cut the frontend integration for repayment and demo it from `chain/scripts/demo-flow.ts`.

---

## 2. Phase 0 — Foundations (W1, AB then split)

### 0.1 Repo skeleton (A, 15 min)
- Create the tree from `two_person_split.md`, minus `loan/drawdown.ts`. Root `package.json` already holds `xrpl` and `xrpl-connect`; keep `chain/` and `frontend/` on their own `package.json` as agreed.
- Branches `chain` and `frontend` off `main`. Merge to `main` only at checkpoints (§8).
- `.env.example` in `chain/` with RPC, WSS, faucet URL, and seed placeholders. Real `.env` gitignored.

### 0.2 Devnet environment (A, 20 min)
- Connect to `wss://lending-hackathon.dev.ripplex.io:51233`. Confirm the SingleAssetVault and LendingProtocol amendments are enabled via `server_info` / `feature`. Record rippled version for the report header.
- Fund five accounts from `https://lending-hackathon-faucet.dev.ripplex.io/accounts`: broker, broker-enforcer (the co-signing key, separate process), lender-1, lender-2, borrower (future multisig). Persist seeds to `chain/.env`.
- Decide the vault asset: native XRP for the demo (RLUSD is testnet-only). Keep the asset behind one constant so an IOU/MPT swap stays possible.
- Write `chain/src/accounts/` helpers: `loadAccounts()`, `fund()`, `client()` with reconnect.

### 0.3 Shared contract (AB, 20 min, then frozen)
`shared/types.ts`, agreed in the same room. Proposed shape:
```ts
type Bid  = { id, borrowerAddress, amount, yieldRate, callDate, vaultId?, loanBrokerId?, loanId? }
type Ask  = { id, lenderAddress, amount, indicated: boolean, matchedBidId? }
type VaultState = { vaultId, asset, assetsTotal, assetsAvailable, sharesTotal, pps,
                    loan?: { loanId, principalOutstanding, totalValueOutstanding, nextPaymentDueDate,
                             paymentRemaining, status: "active"|"impaired"|"defaulted"|"closed" } }
type Position = { depositorAddress, vaultId, shares, principalDeposited, currentValue, accruedYield, yieldShares }
type WithdrawRequest = { depositorAddress, vaultId, mode: "yield-only" | "full" }
type TxReceipt = { hash, result, explorerUrl, ledgerIndex }
```
Only A edits this file after freeze.

### 0.4 Chain client surface (A, define now, implement over W2 and W3)
Everything B calls, in `chain/src/index.ts`:
- `read.vaultState(vaultId): VaultState`
- `read.position(address, vaultId): Position`
- `read.listVaults(): VaultState[]`
- `tx.createBond(bid): { vaultId, loanBrokerId }` (VaultCreate + LoanBrokerSet + cover deposit)
- `tx.deposit(lender, vaultId, amount): TxReceipt`
- `tx.originate(bid, lenderMatched): TxReceipt` (LoanSet with counterparty signature)
- `tx.payCoupon(loanId): TxReceipt`
- `tx.withdraw(req: WithdrawRequest): TxReceipt`
- `tx.finalRepayment(loanId, now): TxReceipt | { blocked: "before-call-date" }`
- `tx.impair(loanId): TxReceipt` and `tx.unimpair(loanId): TxReceipt` (write-down demo)
No local position store. `read.position` derives principal shares from the depositor's own `VaultDeposit` transactions (`account_tx`, share delta in metadata), so fresh accounts and two processes never desynchronise.
Exposed first as a stub returning fixed values (checkpoint C1), then made real function by function.

### 0.5 Demo loan terms (A, decide now, reuse everywhere)
Fixed constants in `chain/src/config.ts` so spikes, demo flow and slides show the same numbers.
- Principal 1000 XRP per bond (large enough that drop-level rounding never shows in interest).
- `PaymentTotal` 3, `PaymentInterval` 180 s, `GracePeriod` 120 s. Call date = StartDate + 3 x 180 s. A 4-minute demo fits inside the schedule with one coupon already paid before going on stage.
- `InterestRate`, `CloseInterestRate`, `ClosePaymentFee` set explicitly, never left to defaults, so early-close pricing is visible in S1.
- A pre-recorded run of `demo-flow.ts` with explorer links in the README is the fallback if the live run drifts past a due date.

---

## 3. Phase 1 — Spikes (A, W1 to W2, must finish before Phase 2)

Standalone scripts in `chain/src/spikes/`, each printing the result code and hash. Every finding is a candidate feedback item, so log with `/xrpl-feedback` as you go.

### S1 — Two multisig questions only (`multisigLoanPay.spike.ts`, 45 min cap)
Both questions are now answered by the spec (§0); S1 confirms them on the devnet and measures the numbers.
Q1. Is a multisigned counterparty signature accepted on `LoanSet`? Borrower: `SignerListSet` {borrower-op, broker-enforcer} quorum 2, `AccountSet asfDisableMaster`. Broker builds `LoanSet` with `Counterparty` = borrower; two signers run `signLoanSetByCounterparty(..., { multisign: true })`, then `combineLoanSetCounterpartySigners`; broker signs and submits. Record result code.
Q2. Is early full repayment allowed, and what does it cost? Right after origination, `LoanPay` + `tfLoanFullPayment` multisigned by two signers. Record result code and the charged `CloseInterestRate` / `ClosePaymentFee`. This is the "nothing stops early repayment" claim in CLAUDE.md §4 and must be measured, not assumed.
Also record on the way: is a plain `LoanPay` accepted before `NextPaymentDueDate`? If not, the demo must wait real time per interval (§2, 0.5).
Coupons with multisign, and the one-signature rejection of the final repayment, are Phase 2 steps 2.6 and 2.9, not spike work.
Exit (done, Sat evening, `docs/spike-results.md` run 2): Q1 yes, `LoanSet` with two counterparty `Signers` validated (9049D4BC738E). Q2 yes, early close validated (685A52185C45) at principal + 1 % + fee, penalty paid into the vault. Coupon before due date accepted; one-signature `LoanPay` rejected `tefBAD_QUORUM`; master-key bypass rejected `tefMASTER_DISABLED`. Multisig borrower is the design.

### S2 — Liquidity guardrail (`liquidityGuardrail.spike.ts`)
1. Vault + broker, lender deposits 100, loan of 90 originated (AssetsAvailable drops to 10, AssetsTotal stays 100).
2. Lender attempts full `VaultWithdraw`. Expect a tec code. Record which one and whether the message makes the cause obvious (feedback item if not).
3. Lender withdraws 5. Expect success. Confirm PPS unchanged.
4. Borrower pays one coupon. Re-read PPS, confirm it rose. Withdraw the yield-sized share amount. Confirm principal share count intact.
Exit (done, Sat evening, `docs/spike-results.md` run 2): `tecINSUFFICIENT_FUNDS` confirmed for the guardrail (minimum-bar item 6); PPS did **not** jump at origination, it rose with the coupon; yield-only withdrawal of 5651 shares succeeded; impair refused with `tecTOO_SOON` until a payment is overdue.

### S3 — Read layer shape (`readLayer.spike.ts`, 20 min)
- `vault_info` by `vault_id`, `ledger_entry` for `LoanBroker` and `Loan`, `account_objects` type `mptoken` for a depositor's share balance, `account_tx` for the share delta of a `VaultDeposit`. Confirm the fields the read layer needs actually come back on this devnet build.
- Confirm whether `LoanBrokerSet` must be sent by the vault owner or can come from any account; the plan assumes broker = vault owner and that is unverified.

---

## 4. Phase 2 — Chain layer build (A, W2 to W3)

**Status Sat 19:00: steps 2.1 to 2.11 implemented and validated through the public API (`npm run demo`, `npm run demo -- --close`).** Modules: `ops.ts` (transactions), `readLayer.ts` (reads), `enforcer/` (policy + key), `loanMath.ts`. Fixtures removed. C2 is reachable as soon as Person B wires `chainClient.ts`.

Order matters: each step is demoable on its own.

| Step | File | Transaction(s) | Done when |
|---|---|---|---|
| 2.1 | `vault/createVault.ts` | `VaultCreate` (Asset, `AssetsMaximum` = bid amount, Data = bid JSON hash, optional `tfVaultShareNonTransferable`) | vaultId returned, visible in explorer, a deposit above the cap is rejected |
| 2.2 | `loan/setBroker.ts` | `LoanBrokerSet` + `LoanBrokerCoverDeposit` | loanBrokerId returned, CoverAvailable > 0 |
| 2.3 | `vault/deposit.ts` | `VaultDeposit` | lender holds share MPT, PPS = 1 |
| 2.4 | `read/vaultState.ts` | `vault_info`, `ledger_entry`, `account_tx` | matches `VaultState` and `Position` types, PPS subtracts `LossUnrealized`; C1 stub replaced |
| 2.5 | `loan/originate.ts` | `LoanSet` with counterparty (multisig if S1 passed) | borrower balance up by principal, AssetsAvailable down |
| 2.6 | `loan/repay.ts` (coupon) | `LoanPay`, multisigned with `Wallet.sign(tx, true)` x2 + `multisign([...])` | PPS strictly higher after |
| 2.7 | `vault/withdraw.ts` | `VaultWithdraw` in shares, yield-only sizing from `Position.yieldShares` | principal shares untouched |
| 2.8 | `multisig/setupSigners.ts` + `enforcer/index.ts` | `SignerListSet`, `AccountSet`; enforcer process with `cosign(txBlob)` | reused from S1; enforcer refuses a close before call date and any non-loan transaction |
| 2.9 | `multisig/gatedRepay.ts` | `LoanPay` + `tfLoanFullPayment`, co-sign only if `now >= callDate`; also submit it with one signature and record the rejection code | returns `blocked` before call date, on-chain rejection with one signature, tesSUCCESS after |
| 2.10 | `loan/impair.ts` | `LoanManage` `tfLoanImpair` then `tfLoanUnimpair` from the broker, only once `NextPaymentDueDate` has passed (`tecTOO_SOON` before) | `LossUnrealized` > 0 on the vault, PPS visibly lower, restored after unimpair |
| 2.11 | `scripts/demo-flow.ts` | all of the above in sequence, fresh accounts each run, prints one line per step: step, result code, hash, explorer link | one command produces the whole story and the raw material for `friction-log.md` |

Yield-shares formula for 2.7: `principalShares` = sum of share deltas in the depositor's own `VaultDeposit` metadata (from `account_tx`), `yieldShares = sharesHeld - principalShares`. Withdraw `Amount = { mpt_issuance_id: ShareMPTID, value: floor(yieldShares) }`; show the sub-unit remainder as unrealized. No local store of PPS at deposit time.

Call-date gate for 2.9: policy lives only in the enforcer process (§11, decision 2). `gatedRepay.ts` builds the transaction, signs with the borrower-op key, and asks the enforcer to co-sign; the enforcer refuses before `callDate`. This is off-chain policy and the report must say so (§7).

---

## 5. Phase 3 — Frontend layer (B, W1 onward, against mocks until C1)

| Step | Where | Depends on |
|---|---|---|
| 3.1 | Pick framework (Scaffold-XRP if it fits, else Vite + React), `frontend/package.json` | nothing |
| 3.2 | `mocks/vaultState.mock.ts` matching `shared/types.ts` | C0 |
| 3.3 | Bid form + bid list (local state / lightweight store) | nothing |
| 3.4 | Ask form + match board (indicative match = same size, ask yield <= bid yield) | nothing |
| 3.5 | Wallet flow: seed-based signer picker for the demo, `xrpl-connect` only if time | nothing |
| 3.6 | `lib/chainClient.ts` calling `chain/src/index.ts` (import or local HTTP shim) | C1 |
| 3.7 | Depositor dashboard: PPS, accrued yield, call-date countdown, "withdraw yield" button | C1 for shapes, C2 for real data |
| 3.8 | Match action triggers `tx.deposit` then `tx.originate` | C2 |
| 3.9 | Repayment panel: countdown, "request final repayment", shows blocked vs success | C3 |
| 3.10 | Broker panel: "impair" and "unimpair" buttons, dashboard PPS reacts (write-down demo) | C3 |

If `chain/` and `frontend/` run as separate processes, A exposes the client as a tiny local HTTP server (`chain/src/server.ts`, JSON in, JSON out) so B never imports Node-only signing code into the browser.

---

## 6. Phase 4 — Integration and end-to-end (AB, late W3 and W4)

1. C2: frontend triggers a real `VaultDeposit`; explorer link appears in the UI.
2. Full loop from the UI: bid, ask, match, deposit, originate, coupon, yield withdrawal.
3. Guardrail demo from the UI: "withdraw full" while loan is outstanding shows the tec code and a human explanation.
4. C3: repayment panel wired to `tx.finalRepayment`, with the demo loan terms from 0.5 so the demo shows blocked then success.
4b. Write-down demo from the UI: broker impairs, every depositor's position value drops, broker unimpairs, value recovers.
5. `demo-flow.ts` re-run on fresh accounts to produce the final set of on-chain links for the README.

---

## 7. Phase 5 — Feedback pipeline (A and B, continuous, 40 percent of score)

Runs in parallel with everything above, not at the end. Owner: A writes, B reviews at each checkpoint. Budget: 15 minutes reserved at C1, C2, C3 and C4, on the clock, before anything else is merged.

- Every friction hit goes through `/xrpl-feedback <text>` immediately, with tx hash. `demo-flow.ts` prints one hash per step so the repro link exists the moment the friction does. The hook also captures failed submits automatically.
- Keep `docs/friction-log.md` as the raw list: category, title, description, repro (hash or code link), severity, library + version, proposed fix. Both people append; no conflicts because it is append-only.
- Run `/xrpl-session-analysis` at the end of W2 and W4.
- Expected headline findings, to be confirmed by the spikes rather than asserted:
  - Spec vs implementation: XLS-66 §3.8.6 says `LoanSet` books `InterestDue` into `AssetsTotal`; rippled 3.4.0-rc1 does not, interest lands with each `LoanPay`. Proposed fix: align the spec text (or state the amendment that changed it) and expose `InterestDue` on the `Loan` entry.
  - `CloseInterestRate` pays the early-close penalty into the vault, so it doubles as an economic yield lock. Proposed doc addition: say where each fee goes (vault vs broker) in one table.
  - Open-ended vault liquidity is not a lock: coupons and deposits refill `AssetsAvailable` and withdrawals are first come first served. Proposed fix: `AssetsMaximum` at creation, plus a per-vault withdrawal floor or a "principal-locked shares" flag in XLS-65.
  - No native time condition on multisig signing; call-date lock is policy. Proposed fix: TokenEscrow `FinishAfter` composition, or a `LoanSet` field for earliest full-repayment date.
  - With the broker as multisig enforcer, coupons and the close share one signer list, so the broker must co-sign routine coupons to be able to gate the close. Proposed fix: per-transaction-type signer requirements, or a native earliest-close date on `LoanSet` so coupons need no co-signature.
  - `LoanDraw` appears in hackathon material but not in the protocol; drawdown semantics of `LoanSet` need a doc callout.
  - Yield-only withdrawal requires client-side share maths with no native "withdraw yield" helper; proposed SDK helper `sharesForAssets(vaultState, amount)`.
  - Whatever S2 returns for the liquidity guardrail: is the result code self-explanatory?
  - Counterparty-signature UX for `LoanSet` with a multisig counterparty (S1 step 2).
- W5: distill `friction-log.md` into `devex-report.md` at repo root, max 3 pages, header: track, flavour, environment, library version.

---

## 8. Checkpoints and git

| Checkpoint | Clock | Merged to main |
|---|---|---|
| C0 | Sat 17:45 | `shared/types.ts` frozen, skeleton pushed |
| C1 | Sat 20:30 | Chain client stub with real shapes; S1 and S2 results in `friction-log.md` |
| C2 | Sun 09:00 (or overnight) | Real deposit from the UI; 2.1 to 2.7 green |
| C3 | Sun 10:30 | Multisig-gated repayment wired; full loop green once |
| C4 | Sun 11:00 | Freeze. Only docs, slides, README after this |

Each checkpoint starts with the 15-minute feedback slot from §7, then the merge.

Root config (`package.json`, `.gitignore`, `CLAUDE.md`) is owned by A. `shared/` by A after C0. `docs/friction-log.md` is append-only for both.

---

## 9. Phase 6 — Submission package (AB, W5 to W6)

- README: purpose, setup, Track 1 open-ended, environment (custom hackathon devnet, rippled version), `xrpl@5.2.0`, list of XLS-65/66 transactions used, table of verified tx links from the last `demo-flow.ts` run.
- `devex-report.md` at repo root (from §7).
- Slide deck, max 10: problem, AT1 mapping, architecture, demo flow, multisig gap + proposed fix, feedback highlights.
- 4-minute demo script: run `demo-flow.ts` live or replay the UI loop; keep pre-generated links as fallback if devnet misbehaves.
- DevEx form: hook is installed for the account that ran setup; the second teammate must run the same setup command on their machine.
- Decide and state the flavour: Vanilla, or Loaded if the multisig borrower is judged a meaningful composition. Mention TokenEscrow hardening as proposed, even if not built.

---

## 10. Risks and cut lines

| Risk | Signal | Cut |
|---|---|---|
| Multisigned `CounterpartySignature` rejected (S1 Q1) | non-tes code | Plain borrower key signs `LoanSet`; enable multisig on the borrower only after origination, before first coupon |
| Early full repayment refused by protocol (S1 Q2) | tec code | The gate is unnecessary; report that as a positive finding and drop `gatedRepay.ts` to a stub |
| Devnet faucet or RPC down | timeouts | Pre-fund extra accounts at W1; keep seeds; capture as infra friction |
| Frontend integration late | C2 slips past Sun 09:30 | Demo the chain layer from `demo-flow.ts`, UI shows mocks |
| Yield-share maths off by rounding | withdraw fails or dents principal | Withdraw `floor(yieldShares)` and show the dust as "unrealized" |
| Coupon `LoanPay` refused before due date | tec code in S1 | Demo waits one `PaymentInterval` per coupon; keep the pre-recorded run as primary |
| Demo overruns a due date | late fee shows up in numbers | `GracePeriod` 120 s absorbs it; otherwise switch to the pre-recorded run |

---

## 11. Decisions

### Decided (Sat 12 Sept, Person A)

1. **Multisig borrower is the design, and the broker is the enforcer.** The platform acts as an on-chain broker in the CEX sense: it co-signs every borrower transaction, coupons included, and refuses the `tfLoanFullPayment` repayment before the call date. The co-signature on coupons is therefore a feature (the broker enforces the schedule and can hold a late issuer), not a side effect. Signer set: {borrower-op, broker-enforcer} with quorum 2, master key disabled. No separate scheduler key.
2. **Enforcer isolation and policy.** The broker-enforcer key lives in its own process, `chain/src/enforcer/`, with its own key file that the app and the demo flow never load. It exposes one call: `cosign(txBlob)`. Policy, in order:
   - refuse anything that is not a `LoanPay` on a loan this broker owns;
   - refuse `tfLoanFullPayment` before the loan's call date (StartDate + PaymentInterval x PaymentTotal);
   - refuse a coupon whose `Amount` differs from the loan's current `PeriodicPayment` read from the `Loan` ledger entry;
   - otherwise sign.
   Origination is created **without** `tfLoanOverpayment`, so the ledger itself rejects any overpayment attempt; the enforcer does not need to handle that case. Refusing to co-sign is not a default: if the borrower then misses the due date plus `GracePeriod`, the broker declares default with `LoanManage` `tfLoanDefault` (step 2.10 covers the sibling impair path). The one-signature rejection in step 2.9 is the on-chain proof that nothing bypasses the enforcer.
   Report framing: the enforcer is a trusted party by construction, like a custodian or exchange. The proposed protocol fix stays the same (earliest-close date on `LoanSet`, or per-transaction-type signer rules) because it would let the issuer pay coupons alone while the broker still gates the close.

### Pending (need A and B together)

3. **Overnight commitment.** Steps 2.5 to 2.7 sit in the optional remote window but C2 at Sun 09:00 needs them. Commit to overnight work, or pull them into Saturday evening and drop S3, the HTTP shim and `xrpl-connect`.
4. **Package layout.** Root `package.json` already holds `xrpl`. Recommendation: chain code lives at root under A, `frontend/` keeps its own package. Decide before the skeleton is pushed.

---

## 12. Subplan index

Cut this file into these subplans when ready:
1. `plan-foundations.md` — §2 (0.1 to 0.5)
2. `plan-spikes.md` — §3
3. `plan-chain.md` — §4
4. `plan-frontend.md` — §5
5. `plan-integration.md` — §6
6. `plan-feedback.md` — §7
7. `plan-submission.md` — §9
