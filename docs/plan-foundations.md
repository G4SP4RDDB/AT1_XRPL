# Subplan 1 — Foundations (Person A)

Source: `docs/dev-pipeline.md` §2 (0.1 to 0.5). Time box: 75 minutes from start. Exit: Person B can code against real types and a stub client, and the spikes have accounts and a client to run on.

Assumptions (overrule in one line if wrong): chain code lives at repo root under Person A, `frontend/` is Person B's own package, TypeScript with `tsx` for scripts, ESM.

## F1 — Devnet reachable (10 min)

1. `src/chain/config.ts`: constants for WSS `wss://lending-hackathon.dev.ripplex.io:51233`, RPC `https://lending-hackathon.dev.ripplex.io:51234`, faucet `https://lending-hackathon-faucet.dev.ripplex.io/accounts`, explorer base `https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/`, demo loan terms from pipeline 0.5.
2. `src/chain/client.ts`: `getClient()` returning a connected `xrpl.Client`, reconnect on close, `explorerTx(hash)` helper.
3. `scripts/check-devnet.ts`: connect, print `server_info` build version and ledger index, call `feature` and print whether SingleAssetVault and LendingProtocol are enabled.
   Done when: script prints both amendments as enabled. If not, stop and escalate; that is the whole project.
   Record the rippled version in `docs/friction-log.md` header (report needs it).

## F2 — Accounts (15 min)

1. `src/chain/accounts.ts`: `fundNewAccount(client)` via the faucet URL (POST, fall back to `client.fundWallet({ faucetHost })` if the faucet accepts it), `loadAccounts()` from `.env`, `Roles` = broker, brokerEnforcer, lender1, lender2, borrower.
2. `scripts/fund-accounts.ts`: creates the five accounts, waits for each to be validated, writes seeds to `.env`, prints addresses and balances. Also funds two spare accounts for spike reruns.
3. `.env.example` with the five role names and placeholders. `.env` in `.gitignore` (check it is).
   Done when: five funded addresses print with balance >= 100 XRP each. Faucet failures are logged with `/xrpl-feedback`.

## F3 — Shared contract (15 min, with Person B, then frozen)

`shared/types.ts` exactly as pipeline 0.3, plus:
- `Bid.status: "open" | "matched" | "originated" | "repaid"`
- `VaultState.callDate` (ISO string) and `VaultState.lossUnrealized`
- `TxReceipt.explorerUrl` always filled from `explorerTx`.
Agree the file in the same room, commit on `main`, then only A edits.
Done when: Person B has pulled it and `mocks/vaultState.mock.ts` compiles against it.

## F4 — Chain client stub (20 min)

`src/chain/index.ts` exporting `read` and `tx` with the exact signatures from pipeline 0.4, every function returning fixed plausible values from `src/chain/fixtures.ts`, tagged `stub: true` in the returned object so the UI can show it.
`src/chain/server.ts`: minimal HTTP JSON shim (Node `http`, no framework), one route per function, `POST /tx/deposit` etc., so Person B calls it from the browser.
Done when: `curl localhost:8787/read/vaultState` returns a `VaultState`. This is checkpoint C1's first half.

## F5 — Friction log and demo-flow skeleton (10 min)

1. `docs/friction-log.md` with the report header (track, flavour, environment, library version) and an empty table: category, title, description, repro, severity, library+version, proposed fix.
2. `scripts/demo-flow.ts` skeleton: numbered steps as TODO stubs, each already printing `step | result | hash | explorer` when implemented.
3. Log the three items already sent through the hook (LoanDraw, vault liquidity, earliest-close term) as the first three rows so the report has a head start.

## Package changes

- Add dev deps: `typescript`, `tsx`, `@types/node`, `dotenv`. Add scripts: `check`, `fund`, `serve`, `demo`.
- `tsconfig.json` targeting ES2022, `module: NodeNext`, `strict: true`.

## Hand-off to Subplan 2 (spikes)

Spikes start when F1 and F2 are green; F3 to F5 can overlap with Person B's meeting. Before S1, fetch `xls.xrpl.org/xls/XLS-0066` and `XLS-0065` and read the LoanSet, LoanPay and VaultWithdraw sections; anything they already answer is struck from the spike and noted in the log.
