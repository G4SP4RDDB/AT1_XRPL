# Two-person split — zero-conflict architecture

The core principle: split by **layer, not by feature**. A feature split (e.g. "you do bids, I do asks") means both people touch the same vault/loan logic and the same UI components constantly — guaranteed merge pain. A layer split gives each person a folder the other never touches, so git conflicts become structurally rare rather than something managed by discipline.

## The split

### Person A — On-chain & multisig layer
Owns the `/chain` folder exclusively.

- `VaultCreate`, `LoanBrokerSet`, `LoanSet`, `LoanDraw`, `LoanPay` construction and submission scripts
- The two Must-have spikes first: multisig + `LoanPay` interaction, and the "insufficient liquidity" guardrail behavior
- `SignerListSet` setup for the repayment multisig, and the signing/scheduling logic that gates the call-date lock
- A thin read layer exposing vault state (PPS, `AssetsTotal`, loan status, accrued yield calc) as plain functions or a small local API — this is the **only** thing Person B depends on
- Stretch: `TokenEscrow`/`FinishAfter` hardening if time allows

### Person B — Frontend & UX layer
Owns the `/frontend` folder exclusively.

- Bid board (borrower posts amount/yield/call date) and ask board (lender indicates interest) — purely frontend state, no chain calls needed for the matching itself
- Depositor dashboard: PPS display, accrued yield estimate, call date countdown
- Wallet connect flow (`xrpl-connect` or seed-based signer selection)
- Calls into Person A's read layer for live data; calls the actual transaction-submission functions Person A exposes when a match/deposit/withdrawal happens — Person B never constructs a raw XLS-65/66 transaction directly

## The one shared file — agreed at hour 0, then frozen

Create `/shared/types.ts` (or `.py`) together, in the same room, before either person writes anything else:

```ts
type Bid = { borrowerAddress, amount, yieldRate, callDate }
type Ask = { lenderAddress, amount, indicated: boolean }
type VaultState = { vaultId, pps, assetsTotal, sharesTotal, loanStatus }
type WithdrawRequest = { depositorAddress, vaultId, mode: "yield-only" | "full" }
```

This is the contract boundary. Once agreed, only Person A edits `/shared` after hour 0 (since it mirrors chain-side objects) — Person B just imports it. If a shape needs to change later, it's a short conversation, not a merge conflict, because it's one small file nobody else is mid-edit on.

## Why this specific split avoids conflicts

- Different folders → git almost never sees the same line touched by both people → merges are fast-forwards, not manual resolutions
- Person B can build the entire bid/ask UI and dashboard against mocked data matching the shared types, before Person A's chain layer is even done — nobody blocks anybody
- Person A can build and test the multisig/repayment logic entirely via scripts/CLI, without ever touching UI code

## Git workflow

- Two branches: `chain` and `frontend`, both off `main`
- Commit small, commit often, push to your own branch continuously — no reason to coordinate on every commit
- Merge to `main` at fixed sync checkpoints (below), not continuously — this avoids half-finished work colliding
- One person owns root config (`package.json`, `.env`, `tsconfig.json`) to avoid both editing it simultaneously — suggest Person A, since chain dependencies (`xrpl`) are more likely to trigger config changes
- Two separate `package.json` files (`/chain/package.json`, `/frontend/package.json`) removes even that shared-file risk

## Sync checkpoints (mapped to the 36h plan)

| Checkpoint | What gets merged |
|---|---|
| Hour 2 | `/shared/types.ts` finalized together |
| Hour 6 | Person A's read layer stubbed with real shapes (even if returning fake values) — unblocks Person B's real integration, not just mocks |
| Hour 10 | First real integration: frontend calls real `VaultDeposit` via Person A's exposed function |
| Hour 20 (before overnight break) | Full loop working end to end at least once — deposit → coupon → yield withdrawal |
| Hour 28 | Multisig-gated repayment wired into the frontend (call date countdown → repayment flow) |
| Hour 32 | Freeze — polish and feedback report only, no new merges |

## Working with AI agents on each side

- Person A's agent stays scoped to `/chain` — feed it the XLS-65/66 transaction shapes and the multisig spike results as context; it's doing tight, testable, script-style work where fast iteration against Devnet matters most.
- Person B's agent stays scoped to `/frontend` and `/shared/types.ts` — feed it the shared types file directly so generated components already match the real data shape instead of drifting from it.
- Neither agent should be given write access outside its owner's folder — that's the actual conflict-prevention mechanism, more than any git discipline. If an agent proposes a change to `/shared`, that's the signal for a short conversation between the two people rather than letting the agent just commit it.

---

## Repository skeleton to push at hour 0

```
repo-root/
├── README.md
├── CLAUDE.md                     # project context file
├── .gitignore
├── shared/
│   └── types.ts                  # Bid, Ask, VaultState, WithdrawRequest — agreed together, then owned by Person A
├── chain/
│   ├── package.json
│   ├── .env.example              # Devnet RPC/WSS, faucet, account seeds (placeholders only)
│   ├── src/
│   │   ├── accounts/             # borrower, lender, broker, multisig signer setup + funding
│   │   ├── vault/
│   │   │   ├── createVault.ts    # VaultCreate
│   │   │   ├── deposit.ts        # VaultDeposit
│   │   │   └── withdraw.ts       # VaultWithdraw (full + yield-only partial)
│   │   ├── loan/
│   │   │   ├── setBroker.ts      # LoanBrokerSet
│   │   │   ├── originate.ts      # LoanSet
│   │   │   ├── drawdown.ts       # LoanDraw
│   │   │   └── repay.ts          # LoanPay (coupon + final multisig-gated repayment)
│   │   ├── multisig/
│   │   │   ├── setupSigners.ts   # SignerListSet
│   │   │   └── gatedRepay.ts     # call-date-gated co-signing logic
│   │   ├── read/
│   │   │   └── vaultState.ts     # PPS, AssetsTotal, loan status, accrued yield — the API Person B calls
│   │   └── spikes/
│   │       ├── multisigLoanPay.spike.ts       # Must-have spike #1
│   │       └── liquidityGuardrail.spike.ts    # Must-have spike #2
│   └── scripts/
│       └── demo-flow.ts          # scripted end-to-end run for the live demo
├── frontend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── pages/ (or app/)
│       │   ├── bids/              # borrower posts a bid
│       │   ├── asks/              # lender posts an ask
│       │   └── dashboard/         # PPS, accrued yield, call date countdown
│       ├── components/
│       │   ├── BidForm/
│       │   ├── AskForm/
│       │   ├── MatchBoard/        # indicative bid/ask matching UI
│       │   └── VaultCard/
│       ├── lib/
│       │   ├── walletConnect.ts   # xrpl-connect or seed-based signer selection
│       │   └── chainClient.ts     # thin wrapper calling into /chain's exposed functions
│       └── mocks/
│           └── vaultState.mock.ts # matches shared/types.ts, used before chain layer is ready
├── docs/
│   ├── devex-report.md            # manual 3-page feedback report, root-level per submission rules
│   └── architecture.md            # this document, or a link to it
└── slides/
    └── deck.pdf                   # max 10 slides, per submission requirements
```

Notes on the skeleton:
- `chain/src/spikes/` is deliberately separate from the main flow — both Must-have spikes (multisig + `LoanPay`, liquidity guardrail) should be quick standalone scripts run and resolved before the rest of `chain/` is built on top of their results.
- `frontend/src/mocks/` lets Person B start immediately without waiting on `chain/` — swap the mock for the real `chainClient.ts` calls once Person A's read layer exists.
- `docs/devex-report.md` sits at the repo root as required by the submission rules — don't nest it inside `docs/` if the hackathon explicitly asks for root placement; check the exact requirement before final submission.
