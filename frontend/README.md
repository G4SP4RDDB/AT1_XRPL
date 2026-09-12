# frontend

Vite + React + TypeScript frontend for the AT1 bond marketplace (Track 1, Custom Hackathon Devnet).

## Setup

```sh
cp .env.example .env   # fill in optional demo seeds
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
  lib/xrpl/      # xrpl.js client, network config, XLS-65/66 transaction + read helpers (TS)
  components/    # BidForm, AskForm, MatchBoard, VaultCard
  pages/         # bids, asks, dashboard
  mocks/         # mock VaultState matching shared/types.ts, used before the chain layer is ready
```

Aliases: `@/*` → `src/*`, `@shared/*` → `../shared/*` (the frozen contract with the chain layer).

## Dependencies

- `xrpl@5.2.0` — stable xrpl.js, ships the XLS-65/66 transaction types. No Vite polyfills needed since 3.0.
- `xrpl-connect@0.8.2` — wallet connect abstraction (Xaman, Crossmark, GemWallet). Optional; demo accounts can use seed-based signing.

## Tests

Vitest + React Testing Library, jsdom environment. Test files live next to the code (`*.test.ts(x)`) or in `__tests__/` folders; global setup is in `src/test/setup.ts`.

```sh
npm test               # single run
npm run test:watch     # watch mode
npm run test:coverage  # v8 coverage report in coverage/
```
