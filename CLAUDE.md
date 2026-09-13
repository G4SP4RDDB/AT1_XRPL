# CLAUDE.md — AT1 Bond Issuance Platform on XRPL (XLS-65/66)

This file gives an agent all the context needed to work on this project without re-reading prior history. It documents the project, the final architecture decision, the protocol mechanics being used, and what's still open.

---

## 1. Event context

**XRPL Lending Protocol Hackathon**
Hosted by DeVinci Blockchain and Ripple, September 12–13, 2026, IIM Campus du Parc, Nanterre (Paris–La Défense).

- Format: teams of 2–4 people, 36h of hacking (Saturday 11:30am → Sunday 1pm, with a remote overnight break from 9pm to 8:30am)
- Submission: Sunday September 13, 1:00pm CEST
- Presentation: 4-minute live demo + 2-minute Q&A
- Prizes: $10,000 total ($5,000 cash pool for top 4 teams + $5,000 Swell travel grant for top 2 teams)

### Judging criteria (weighting)

| Criterion | Weight |
|---|---|
| **Developer feedback quality** | **40%** |
| Technical execution on XRPL | 30% |
| Creativity and use case | 20% |
| Presentation and live demo | 10% |

Feedback is the dominant criterion. Every friction point must be documented with: category, title, description, repro (transaction/code link), severity, library + version. **Proposed fixes score higher than simply flagging an issue** ("Proposals score above flagging").

### Mandatory submission deliverables
- Public GitHub repo
- README (project purpose, setup, track, environment, library version, list of XLS-65/66 transactions used)
- Links to verified on-chain transactions
- Slide deck (max 10 slides)
- Manual developer feedback report (max 3 pages), at the repo root
- Completed DevEx form (automated hook + team members)

### Mandatory tooling
- **DevEx hook** to be installed on **every developer's** machine from the start: `github.com/RippleDevRel/xrpl-devex-hook` — automatically collects friction signals (failed submits, retries, doc lookups)

---

## 2. Track choice — FINAL DECISION

The project went through two pivots: Track 1 (open-ended) → Track 2 (closed-ended, for fixed yield) → back to **Track 1 (open-ended)**, once the call-date lock was redesigned around a multisig-gated repayment rather than the vault's own phase gating. See §4 for why this makes closed-ended unnecessary.

### Track 1 network configuration (to use)

| Parameter | Value |
|---|---|
| Vault | Open-ended |
| Protocol | Lending Protocol V1 |
| Network | Custom Hackathon Devnet |
| Faucet | https://lending-hackathon-faucet.dev.ripplex.io/accounts |
| RPC | https://lending-hackathon.dev.ripplex.io:51234 |
| WSS | wss://lending-hackathon.dev.ripplex.io:51233 |
| Explorer | https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/ |
| Library | Stable xrpl.js |

Do not mix this configuration with Track 2's Public Devnet / xrpl.js@5.2.0-beta.0 setup used during the earlier closed-ended exploration.

### Track 1 minimum bar
1. Create an open-ended Single Asset Vault
2. Deposit capital from at least one lender account
3. Set up a loan broker, originate a loan the borrower accepts
4. Execute a drawdown, process at least one repayment
5. Withdraw capital plus accrued yield
6. Demonstrate a rejected transaction caused by a protocol guardrail (insufficient liquidity, out-of-schedule payment, or first-loss cover behaviour)
7. Wrap the flow in a credible use case

### Flavour: Vanilla vs Loaded
- Vanilla: XLS-65 + XLS-66 alone, with a credible use case
- Loaded: Vanilla + one additional primitive (Permissioned Domains/Credentials, TokenEscrow, sponsored fees/reserves, MPTs)
- Loaded is not scored higher by default — a well-executed Vanilla build with a sharp report beats a poorly composed Loaded build

Note: the multisig repayment lock (§4) is itself a strong Loaded candidate if it's judged to compose meaningfully with the core XLS-65/66 flow — flag this explicitly at submission time.

---

## 3. Final architecture — bid/ask bond marketplace on an open-ended vault

### Core idea

Each bond issuance is its own open-ended vault, created automatically the moment a borrower posts a bid. Lenders express interest through a purely indicative frontend matching layer (no on-chain order book). Depositors can withdraw accrued yield at any time; principal stays effectively locked until the call date because it's out on loan and its final repayment is gated by a multisig.

### Workflow

1. Borrower emits a bid — specifies amount requested, yield offered, and a call date. This action automatically triggers vault creation:
   - VaultCreate (open-ended) — one vault per bond/bid
   - LoanBrokerSet — broker terms, fees, first-loss capital for this specific issuance
   - LoanSet — loan terms drafted with rate = yield offered, term aligned to the call date, co-signed once a lender is matched
2. Lenders create asks — this is a purely frontend, indicative action. There is no real on-chain order book; it's a matching/discovery layer that shows the person needing money (the borrower) that interest exists at a given size/yield. The actual on-chain action only happens once a match is made.
3. Matched deposit — once a bid and an ask align, the lender executes VaultDeposit into that specific bond's vault. Shares (MPT) are minted at the current PPS.
4. Drawdown — the borrower receives the principal via LoanDraw/LoanSet execution.
5. Coupon cycle — the borrower pays yield periodically via LoanPay. This raises AssetsTotal, and therefore the PPS, without touching principal.
6. Yield withdrawal (depositor-facing feature) — depositors can withdraw the accrued yield portion at any time via a partial VaultWithdraw, leaving enough shares in the vault to keep their principal position intact. This is possible precisely because the open-ended vault allows withdrawals at any time — the trick is that only the yield-equivalent share count is redeemed, not the full position.
7. Call date and principal lock (see §4) — the principal itself stays effectively locked until the call date, enforced by a multisig gate on the final repayment transaction, not by the vault type itself.

### Roles (native protocol mapping)

| AT1 role | Protocol role | Action |
|---|---|---|
| Bond investor | Lender | VaultDeposit (matched from an ask), partial VaultWithdraw (yield only) |
| Platform / structurer | Loan Broker | LoanBrokerSet, deposits first-loss capital, holds a multisig seat |
| Issuing borrower | Borrower | Posts the bid, co-signs LoanSet, receives principal, repays via LoanPay, needs multisig co-signature to execute the final principal repayment |
| Matching layer | Application (frontend only) | Bid/ask board — no on-chain order book, purely indicative |

---

## 4. Call date lock via multisig — the key design decision

### Why open-ended works here (and closed-ended is no longer needed)

The earlier closed-ended exploration existed to get a fixed lifecycle and a locked redemption window natively. This is now solved differently: the vault's own liquidity constraint already prevents early principal withdrawal — if all deposited capital is out on loan, there simply isn't enough liquid AssetsTotal in the vault to honor a full principal withdrawal before the loan repays. This is, in fact, one of the native guardrail rejections the Track 1 minimum bar explicitly asks teams to demonstrate ("insufficient liquidity").

What's still missing natively is control over when the borrower is allowed to repay — nothing stops a borrower from repaying early via LoanPay, which would make principal liquid and withdrawable before the intended call date. That's the actual problem the multisig solves.

### The mechanism

- The final principal repayment transaction (the LoanPay that clears the loan) is only broadcastable once it carries signatures from a multisig signer set (e.g. the broker + an operational/scheduling signer).
- The multisig's policy: signers only co-sign the final repayment at or after the agreed call date.
- Until that repayment lands, principal remains out on loan and therefore illiquid inside the vault — depositors can still withdraw their accrued yield (§3, step 6) but cannot pull principal, without needing any special vault-level lock.

### Open question to flag explicitly

XRPL multisig has no native time-based signing restriction — an N-of-M signer list is purely about who signs, not when. Enforcing "don't sign before the call date" is currently an off-chain policy/trust assumption on the signers (or a scheduling bot that checks the date before co-signing), not an on-chain guarantee.

Two things to test/consider early:
1. Spike: confirm exactly how a multisig account interacts with LoanPay submission in this protocol version — does the transaction need all signer approvals before submission, or can it be submitted and rejected on-ledger if not enough signatures are present?
2. Possible hardening (stretch): combining the multisig with a native time primitive (e.g. TokenEscrow, XLS-85, which supports FinishAfter conditions) could turn "signers agree not to sign early" into an actual on-chain time lock. This would be a natural Loaded-flavour candidate if time allows, and is worth mentioning even if not built, since it directly proposes a fix to the multisig's timing gap — exactly the kind of proposal the feedback criteria rewards.

This whole section — the fact that call-date enforcement has to be bolted on via a multisig with no native time semantics — is very likely the single strongest feedback finding for this project. Document it precisely, with the repro of what was and wasn't achievable.

---

## 5. Yield distribution — mechanism

Yield is never actively pushed to depositors — it accrues passively in the Price Per Share (PPS), and depositors choose when to realize it.

PPS = AssetsTotal / SharesTotal

- Each LoanPay coupon from the borrower raises AssetsTotal without minting new shares → PPS rises for every depositor in that bond's vault, pro rata
- Yield withdrawal: a depositor can execute a partial VaultWithdraw — redeeming only the number of shares whose current value corresponds to their accrued yield, leaving the remaining shares (representing principal) untouched in the vault. This requires the frontend/application layer to compute "how many shares = yield accrued since deposit" before submitting the withdrawal, since the protocol itself just burns shares for assets at the current PPS — the yield-only framing is an application-layer interpretation, not a native transaction type.
- Principal effectively stays locked for the reasons in §4 (illiquidity while out on loan + multisig-gated final repayment), not because of any withdrawal restriction on the shares themselves.

---

## 6. Full technical mapping: AT1 concept to XLS-65/66 (updated for final architecture)

| AT1 concept | Transaction / mechanism | Fidelity |
|---|---|---|
| Bond creation (per bid) | VaultCreate (open-ended), triggered automatically per bid | Native |
| Investor matching | Frontend bid/ask board | Application-layer only, not on-chain |
| Investor funding | VaultDeposit, post-match | Native |
| Risk structuring | LoanBrokerSet (fees, rate, debt cap, first-loss capital) | Native |
| Loan origination | LoanSet (broker + borrower co-signature) | Native |
| Coupon payment | LoanPay (interest portion) | Native |
| Yield withdrawal | Partial VaultWithdraw, sized to accrued yield by the application layer | Native transaction, custom sizing logic |
| Principal lock until call date | Vault illiquidity (capital out on loan) + multisig gate on final LoanPay | Composite — native illiquidity + custom multisig policy, no native time-lock |
| Subordination / loss absorption | First-loss capital (CoverAvailable, CoverRateMinimum, CoverRateLiquidation) | Native, continuous mechanism |
| Discretionary coupon (skip) | No primitive — voluntarily withholding a scheduled LoanPay | Native grace/default behaviour to test before implementing |
| Write-down trigger (CET1-style threshold) | Impairment, manually triggered on an off-chain signal | Requires an external oracle, likely out of MVP scope |
| Conversion to equity | No primitive — XLS-66 allows write-down, not conversion | Out of scope, document as a known limitation |

---

## 7. Other technical frictions identified (test early)

| # | Point to test | Why it matters |
|---|---|---|
| 1 | Multisig + LoanPay interaction (§4) | Core to the whole call-date lock design — must be validated before building the rest |
| 2 | Behaviour of a missed/withheld scheduled LoanPay | Needed if the discretionary-coupon feature is attempted |
| 3 | Multi-party signature coordination on LoanSet (broker + borrower) | Explicitly cited in the hackathon feedback criteria — UX behaviour to document |
| 4 | Reading NAV/PPS/utilisation/accrued yield cleanly | Needed to compute "shares = yield accrued" for the partial withdrawal feature (§5) |
| 5 | Exact behaviour of the "insufficient liquidity" guardrail rejection | This is both a minimum-bar deliverable (item 6, §2) and the mechanism the principal-lock relies on — confirm it triggers as expected when a full withdrawal is attempted while capital is out on loan |

---

## 8. Structural limitations to document explicitly

- No native time-lock on multisig signing — the call-date enforcement is a policy/trust assumption on signers, not an on-chain guarantee (§4). This is the headline limitation of the whole design.
- No on-chain order book — the bid/ask matching is entirely a frontend construct; nothing about lender interest or borrower demand is recorded on-ledger until a deposit actually happens.
- No native conversion to equity — XLS-66 allows write-down but not minting synthetic equity shares in exchange.
- No native trigger based on an external ratio — a CET1-style trigger requires an off-chain oracle; Impairment must be manually triggered.
- No native per-investor minimum denomination — unlike the real ~200k euro minimum ticket, XRPL doesn't natively enforce a floor per investor; KYC gating via Credentials/Permissioned Domains remains the natural workaround if pursued as a Loaded extension.

---

## 9. Reference — Comparable project (Wift)

Prior hackathon project (XRPL Hackathon, April 2026): Principal/Interest tokenization a la STRIPS on XLS-66 positions, with a secondary market.
Repo: github.com/skar8848/Wift_XRPL-Hack

Transferable lessons:
- Native XLS-65/66 Vault/LoanBroker used unmodified — the custom tokenization layer always comes from an application wrapper on top
- PT/YT initially planned as MPTs, migrated to IOU trustlines after the native AMM rejected them ("Amount can not be MPT")
- Trading via OfferCreate on the native DEX rather than the AMM
- Their v1 trust model uses the same primitive this project is proposing: a 3-of-5 multisig pseudo-account enforcing issuance/redemption rules, with a stated roadmap (post XLS-101d) to move enforcement fully on-chain. This is a strong precedent for the multisig approach here — and their documented limitation ("trust assumption goes from 3/5 signers to zero" only once native smart contracts support the amendments) mirrors exactly the open question in §4.

---

## 10. Development prioritization (36h)

### Must-have
1. Spike: multisig + LoanPay interaction (§7.1) — validates the whole call-date lock design
2. Spike: confirm the "insufficient liquidity" guardrail rejection behaves as expected on a full withdrawal attempt while capital is on loan (§7.5)
3. Vault creation triggered by a borrower bid (VaultCreate, LoanBrokerSet)
4. Frontend bid/ask board (indicative matching only)
5. Matched deposit leading to VaultDeposit, loan origination via LoanSet, drawdown
6. Coupon cycle via LoanPay
7. Partial VaultWithdraw for yield-only redemption (§5)
8. Multisig-gated final repayment transaction

### Should-have
9. Demonstrate the required guardrail rejection (minimum bar item 6) using the liquidity constraint itself
10. Basic dashboard: PPS, accrued yield estimate, call date countdown

### Nice-to-have / stretch
11. TokenEscrow (FinishAfter) layered onto the multisig for genuine on-chain time enforcement (§4) — strong Loaded-flavour candidate
12. KYC gating via Credentials/Permissioned Domains
13. Discretionary coupon skip

### Not a priority for this hackathon
- Conversion to equity
- Real on-chain order book (bid/ask stays frontend-only by design)
- Write-down trigger against an external oracle

---

## 11. Dependencies and setup

Sourced from the hackathon Notion and workshop slides. Items marked "not yet decided" are project stack choices, not hackathon requirements — pick before Must-have item 3 (§10) starts.

### Core XRPL client (confirmed, mandatory)

```json
{
  "dependencies": {
    "xrpl": "^5.2.0"
  }
}
```
- Track 1 requires the stable `xrpl.js` release; the project is on stable `xrpl@5.2.0`, which ships the XLS-65/66 transaction types. Do not install the `5.2.0-beta.0` prerelease line used during the Track 2 exploration.
- Recommended client libraries per the workshop slides: `xrpl.js` (JS/TS) and `xrpl-py` (Python) are both explicitly "Recommended" by Ripple DevRel. `xrpl4j` (Java) and `xrpl-rust` exist but aren't flagged as recommended. Pick JS/TS unless there's a reason to use Python — the reference app and most tooling below assume JS/TS.

### Wallet integration (optional but useful for the demo)

- `xrpl-connect` — `github.com/XRPL-Commons/xrpl-connect` — single SDK abstracting Xaman, Crossmark, GemWallet and others behind one interface. Useful if the demo needs a real wallet connect flow for borrower/lender/broker accounts rather than raw seed-based signing.
- Seed-based signing (via `xrpl.Wallet.fromSeed()`) is sufficient for the demo accounts (broker, borrower, lender, multisig signers) and is what the code examples in the workshop slides use by default — no extra package needed for this path.

### Multisig (no extra package required)

- Multisig is a native ledger feature configured via `SignerListSet`, already covered by the `xrpl` package. No separate library is needed to implement the call-date repayment lock (§4) — the work is entirely in constructing and co-signing `LoanPay` transactions against a multisig-enabled account, not in tooling.

### Stretch primitive: TokenEscrow (if pursued, §10 item 11)

- `TokenEscrow` (XLS-85) is a native transaction type, also covered by the `xrpl` package — no extra dependency. Relevant fields: `FinishAfter` for the time-based release condition mentioned in §4.

### Starter kits and scaffolding (optional accelerators)

- `Scaffold-XRP` — `github.com/XRPL-Commons/scaffold-xrp` — full-stack starter kit with wallet connection and UI wired up; could shortcut the bid/ask frontend board (§3) if its structure fits.
- `Bedrock` — `github.com/XRPL-Commons/Bedrock` — lower-level building blocks maintained by XRPL Commons.
- Reference lending app — `github.com/ripple/xrpl-reference-app-lending-sav` — forkable end-to-end implementation of vault + loan lifecycle (create, deposit, originate, repay). Worth forking as a base rather than starting from zero, since it already covers most of the Must-have items 3, 5 and 6 in §10.

### Mandatory tooling (not a package, but a required install)

- DevEx hook — `github.com/RippleDevRel/xrpl-devex-hook` — install on every developer's machine at the very start (§1). This is separate from the `xrpl` package and collects friction signals automatically.

### Test currency

- RLUSD test tokens are available via `tryrlusd.com`, but only on **Testnet, not Devnet** — not usable for this project's Custom Hackathon Devnet setup (§2). Use native XRP or a self-issued IOU/MPT for the vault's underlying asset instead.

### Not yet decided (project stack choices, not hackathon requirements)

- Frontend framework for the bid/ask board and depositor dashboard (§3, §10 item 10) — Scaffold-XRP above would imply a specific choice if adopted
- Backend/API framework, if the multisig signing/scheduling logic (§4) runs as a service rather than client-side scripts
- Database or storage layer for the frontend-only bid/ask matching state (§3, §8) — this is explicitly off-ledger by design, so any lightweight store works
- Language for the multisig signing bot/scheduler (§4) — JS/TS keeps it consistent with the `xrpl` package choice above, but nothing mandates it

---

## 12. Reminder on the feedback report (40% of the score)

Structure the max-3-page report around this document's findings rather than as a flat list:
- The strongest throughline: the multisig timing gap (§4) — a precise, testable design problem with a proposed hardening path (TokenEscrow), not just a flagged limitation
- Every limitation in §8 should be presented with a concrete proposed fix
- Required header format for the report: track, flavour, environment, library version
