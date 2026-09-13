# frontend

Vite + React + TypeScript frontend for the AT1 bond marketplace (Track 1, Custom Hackathon Devnet).

## Setup

```sh
cp .env.example .env   # devnet endpoints + VITE_CHAIN_URL (the chain shim)
npm install
npm run dev            # http://localhost:5173
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) then production build |
| `npm run typecheck` | Type-check only |
| `npm run lint` | oxlint |

## Layout

```
src/
  lib/xrpl/        # network config + read-only xrpl.js client (balances, explorer links)
  lib/             # wallet context (wallet.tsx), xrplConnect adapters, chainClient (talks to the shim), order book + bank-profile helpers
  components/      # IssueBond, FinanceBonds, OrderBookPanel, TrancheBook, TranchePage, VaultCard, WithdrawModal, CouponModal, MultisigRepayModal, BrokerHub, onboarding + wallet modals
integration/       # vitest integration suite against the live shim + devnet (npm run test:integration)
```

Aliases: `@/*` → `src/*`, `@shared/*` → `../shared/*` (the frozen contract with the chain layer).

## Dependencies

- `xrpl@5.2.0` — stable xrpl.js, ships the XLS-65/66 transaction types. No Vite polyfills needed since 3.0.
- `xrpl-connect@0.8.2` — only its WalletConnect adapter is registered (Xaman or any WalletConnect wallet). Every signature goes through `signPrepared()` in `src/lib/xrplConnect.ts` (prepare → sign → submit); the frontend never holds a seed.

## Tests

Vitest + React Testing Library, jsdom environment. Test files live next to the code (`*.test.ts(x)`) or in `__tests__/` folders; global setup is in `src/test/setup.ts`.

```sh
npm test               # single run
npm run test:watch     # watch mode
npm run test:coverage  # v8 coverage report in coverage/
```
