# Bank Profiles & Tranche Order Book

Two features built on top of the Track 1 vanilla flow, on branches `feature/bank-profiles`
and `feature/orderBook` (the latter based on the former — `feature/orderBook` has both).
Neither changes the underlying XLS-65/66 transaction flow; both are off-chain UI/UX layers
on top of the existing vault + loan broker mechanics documented in `docs/chain-api.md`.

## How to run it

```bash
# from repo root
npm run serve                    # chain shim on :8787 (now also serves /profile/* and /book/*)
ENFORCER_URL=http://localhost:8788 npm run serve   # if running the enforcer as its own process
npm run enforcer                 # optional, :8788

cd frontend
npm run dev                      # Vite dev server
```

Open the URL Vite prints — typically **http://localhost:5173** (Vite falls back to 5174,
5175, ... if that port is already taken by another instance).

Any change to `src/chain/server.ts` or the files it imports (`profileStore.ts`,
`trancheBookStore.ts`, `index.ts`, `ops.ts`, ...) requires **restarting the `npm run serve`
process** — `tsx` does not hot-reload a running process. The frontend Vite dev server does
hot-reload on file changes, so it normally does not need restarting.

---

## 1. Bank Profiles (`feature/bank-profiles`)

**Problem:** the UI showed raw XRPL addresses everywhere (`Issuer: rsnFbojc...`), and the
only "name" a bid/ask carried was a one-off string typed at submit time — not a persistent
identity tied to the address.

**What was built:** an off-chain address → institution registry, plus an onboarding flow
that prompts a newly-connected address to create one.

### Data model — `shared/types.ts`
```ts
export interface BankProfile {
  address: Address;
  bankName: string;
  shortCode?: string;
  country?: string;
  logoEmoji?: string;
  createdAt: IsoDate;
}
```

### Backend — `src/chain/profileStore.ts`
JSON-file-backed store at `data/bank-profiles.json` (gitignored), seeded on first run with
the four `ROLE_ACCOUNTS` addresses from `frontend/src/lib/wallet.tsx` (Borrower → "Nordic
Capital Bank", Lender 1 → "Helios Pension Fund", Lender 2 → "Meridian Asset Management",
Broker → "AT1 Structuring Desk"). Wired into `server.ts` as the `profile` group:

| Route | Behavior |
|---|---|
| `POST /profile/get` (`[address]`) | Returns the profile or `null` |
| `POST /profile/set` (`[{address, bankName, shortCode?, country?, logoEmoji?}]`) | Upsert; throws if `address`/`bankName` missing |
| `POST /profile/list` (`[]`) | Every known profile |

### Frontend
- `frontend/src/lib/bankProfiles.ts` — client cache + `useBankName(address, fallback?)` and
  `useBankProfile(address)` hooks, `getCachedProfile`, `saveProfile`, `shortenAddress`.
- `frontend/src/components/ResolvedName.tsx` — a tiny component wrapper around
  `useBankName`, so it can be called safely inside a `.map()` (hooks can't be called
  directly inside a loop body).
- `frontend/src/components/BankProfileModal.tsx` — the onboarding form (bank name + optional
  short code / country / logo emoji). Auto-opens the first time a connected address has no
  profile (wired in `App.tsx`); reachable anytime via the 🏦 button in the navbar.
- Every place that used to show a truncated address as the primary label now resolves a
  bank name instead (address kept as a secondary/tooltip detail): `Navbar`, `VaultCard`,
  `MatchBoard` *(later deleted — see below)*, `FinanceBonds`, `BidForm`/`AskForm` *(also
  later deleted)*.

### Known limitation (intentional, documented)
No auth on `profile.set` — any client can set any address's profile. Fine for a hackathon
devnet demo; not a real access-control boundary. Worth one line in the feedback report as an
app-layer (not protocol-layer) trust assumption.

---

## 2. Tranche Order Book (`feature/orderBook`)

**Motivation:** the bank should be able to emit several AT1 debt tranches at once, each with
its own amount/rate/maturity depending on urgency (e.g. 1M urgently now vs. 10M in a week at
a lower rate), and LPs should be able to browse all open tranches and bid on whichever suits
them — a small order book, laid out like **app.tenor.finance**'s markets list + trading page.

**Key design decision — discussed and confirmed before building:**
- The **ask** (a tranche's amount/rate/maturity) is real and on-chain: posting one still
  triggers `VaultCreate` + `LoanBrokerSet` + `LoanBrokerCoverDeposit` exactly as before, one
  vault per tranche.
- The **bid** (an LP's interest in funding a tranche) stays **off-chain and indicative**
  until explicitly funded — because XLS-66 has no primitive for a resting/conditional order
  (`VaultDeposit` is immediate and unconditional, it doesn't wait to be matched at a rate).
  This was logged as XRPL DevEx feedback this session (see below).
- Rather than a rate-auction across competing LP bids (every depositor in one vault shares
  one rate — XLS-66 has no per-lender differential), the first version is **first-come,
  first-served up to the vault's existing `AssetsMaximum` cap**. A bid that no longer fits
  gets a native on-chain guardrail rejection (`tecINSUFFICIENT_FUNDS`-style) when funded —
  which is also minimum-bar item 6 (demonstrate a guardrail rejection), for free.
- The off-chain store is a **shared JSON file**, not a real database — explicitly agreed as
  enough for this demo's resilience needs, same pattern as the bank-profile store.

> **Rewired since the first version** (same session, on request): the "urgency" tag/sort was
> removed, both the tranche's ask and every LP bid gained an optional expiry/"time in force",
> and the per-tranche view became a real full page with its own URL instead of an inline
> panel below the list. See "Rewire" below — this section describes the mechanics that are
> still current; details that changed (urgency, inline panel) are noted as superseded.

### Data model
`Bid` (the tranche/ask) and `Ask` (the LP bid) each gained one optional field in
`shared/types.ts`:
```ts
// Bid
expiresAt?: IsoDate; // bidding window closes at this time, no new bids after
// Ask
expiresAt?: IsoDate; // this bid is void if not funded before this time
```
(An earlier `urgency?: "urgent" | "standard" | "flexible"` field on `Bid` was added, then
removed at the same request that added `expiresAt` — a duration/expiry was judged more
useful than a purely cosmetic urgency tag.)

### Backend — `src/chain/trancheBookStore.ts`
JSON-file store at `data/order-book.json` (gitignored), two collections:
- **tranches** — the off-chain-authored `Bid` fields (`borrowerName`, `description`,
  `expiresAt`) that the ledger doesn't carry. The frontend merges this with live vault state
  from `read.listVaults()`; the ledger stays the source of truth for amount/rate/status.
- **bids** — LP commitments (`Ask` records), `"pending"` until actually funded.

Wired into `server.ts` as the `book` group (unchanged by the rewire):

| Route | Behavior |
|---|---|
| `POST /book/listTranches` (`[]`) | Every tranche's off-chain metadata |
| `POST /book/upsertTranche` (`[tranche]`) | Called right after `tx.createBond` succeeds |
| `POST /book/listBids` (`[trancheId?]`) | All LP bids, or scoped to one tranche |
| `POST /book/createBid` (`[bid]`) | Throws if `id`/`matchedBidId` missing |
| `POST /book/updateBidStatus` (`[id, status]`) | Throws if the bid id is unknown |

### Frontend
- **`frontend/src/lib/chainClient.ts`** — `getBids()`/`getAsks()` now read the shared
  `/book/*` store instead of `localStorage` (the old `BIDS_KEY`/`ASKS_KEY` and their
  load/save helpers are gone). Two new methods:
  - `acceptBid(askId)` — converts one pending LP bid into a real `tx.deposit`
    (`VaultDeposit`); does **not** originate the loan.
  - `originateTranche(trancheId)` — explicit `tx.originate` (`LoanSet`), callable once a
    tranche has collected enough deposits (or any time — the ledger enforces
    `assetsAvailable >= amount` itself).
  - `matchAndDeposit` was removed (its only caller, `MatchBoard`, is deleted — see below).
- **`frontend/src/components/TrancheBook.tsx`** — the tranche list ("Order Book" tab).
  Sortable by rate / maturity / expiry; each row shows the bank name (via the bank-profile
  feature), amount, rate, maturity, time left on the bidding window, and a live
  fill-progress bar. Clicking a row navigates to that tranche's own page (see Rewire below).
- **`frontend/src/components/IssueBond.tsx`** — gained a "Bidding Window" duration selector
  (6h / 24h / 3d / 7d / 14d), passed through to `createBid` as `expiresAt`.
- **Navbar / App.tsx** — new "Order Book" tab (added first in the tab order; "Finance
  Bonds" stays the default landing tab so existing behavior isn't disrupted).

### Dead code removed
While wiring the new tab, found that `frontend/src/pages/MarketplacePage.tsx` and
`DashboardPage.tsx` were never imported by `App.tsx`/`main.tsx` — leftover, unrouted
scaffolding from an earlier page-based design. `MatchBoard.tsx` was only used by
`MarketplacePage`, and `BidForm.tsx`/`AskForm.tsx` were only used by `MarketplacePage`
too (the live app's actual tranche-creation form is `IssueBond.tsx`, which duplicates
`BidForm`'s logic directly rather than rendering it). All five were deleted rather than
left as a second, unused matching UI.

### Verified live against the real hackathon devnet (first version)
Not just typecheck/tests — walked the actual flow in a real browser session:
1. Created a tranche (5000 XRP, 9.5%, urgent) as the Borrower role → real `VaultCreate` +
   `LoanBrokerSet` + `LoanBrokerCoverDeposit`, synced into the shared book.
2. Switched to the Lender 1 role in the same browser, saw the same tranche (proving the
   shared store, not per-browser state).
3. Placed a 2000 XRP bid, then a 500 XRP bid (both off-chain, "pending").
4. Funding the 2000 XRP one correctly failed on-chain with a genuine
   `tecINSUFFICIENT_FUNDS` (the account only held ~761 XRP) — surfaced cleanly in the UI,
   not as a crash.
5. Funding the 500 XRP one succeeded: real `VaultDeposit`, tx hash shown, fill progress
   updated to "500 / 5000 (10%)" live.

One real environment quirk hit during this test, logged as XRPL DevEx feedback this
session: `read.listVaults()` (used by `getAllVaults()`/`getBids()`) consistently took
10–13 seconds per call on this devnet, with no progress indicator — worth designing
explicit loading states around, not a bug.

### What's not built yet
- The reverse-auction variant (LPs bid their own rate, a clearing rate is computed) —
  discussed as a stretch, not started.
- The "Originate Loan" button's happy path wasn't exercised to completion in the live test
  (would need a tranche funded to 100%, i.e. more funded LP accounts than were available
  in the smoke test) — the code path reuses the same `tx.originate` call already proven by
  the pre-existing `fundBond` flow, so it's expected to work, just not click-tested end to
  end.

---

## 3. Rewire — per-vault pages, two-sided book, expiry, "blanc cassé" (same session)

Requested after the first version was live-tested: remove the urgency tag, give each
tranche its own dedicated page (like `app.tenor.finance/trading/<id>`) instead of an inline
panel below the list, show an explicit two-sided **Ask / Bids** book on that page, add a
time-in-force ("duration") to both asks and bids, and restyle the whole section in the
off-white ("blanc cassé", measured as `rgb(251, 250, 249)` / `#FBFAF9` from the reference
site's own `body` background) look of the reference app.

### Removed
- The `urgency` field/tag/sort throughout (`shared/types.ts`, `IssueBond.tsx`,
  `TrancheBook.tsx`) — judged unnecessary once an actual expiry existed.
- `frontend/src/components/TrancheDetail.tsx` — superseded by `TranchePage.tsx` below.

### Added
- **`frontend/src/lib/durations.ts`** — shared time-in-force helpers used by both sides:
  `DURATION_OPTIONS` (6h/24h/3d/7d/14d), `expiresAtFromNow(ms)`, `isExpired(iso)`,
  `formatTimeRemaining(iso)` (renders "23h left" / "3d left" / "Expired" / "No expiry").
- **`frontend/src/lib/hashRoute.ts`** — a tiny hash-based router (`#/orderbook/<id>`) so
  every tranche has its own real, shareable/bookmarkable URL without adding a routing
  library. `getTrancheIdFromHash`, `navigateToTranche(id)`, `navigateToTrancheList()`.
- **`frontend/src/lib/orderBookTheme.ts`** — the "blanc cassé" palette (`pageBg: #FBFAF9`,
  white inner panels, warm-gray borders/text, a serif display font for headlines), scoped to
  the Order Book components only — the rest of the app's `index.css` variables are
  untouched.
- **`frontend/src/components/TranchePage.tsx`** (replaces `TrancheDetail.tsx`) — a full page
  per tranche, navigated to via `TrancheBook`'s row click (which sets the hash) and rendered
  in place of the list whenever the hash names a tranche. Structure:
  - **Ask** section: one row — the tranche's posted terms (bank name, rate, remaining
    capacity, time left on the bidding window).
  - **Bids** section: the existing LP-bid depth list (cumulative-fill bars, status), now
    also showing each bid's own expiry.
  - Right-hand action panel unchanged in behavior (bank sees fill % + "Originate Loan"; LP
    sees "Place a Bid" — now with its own duration selector — and "Fund Now" per bid), with
    both disabled once the tranche's/bid's expiry has passed.
  - A "← Back to Order Book" control returns to the list via the same hash router.

### Data model note
`expiresAt` is off-chain-only bookkeeping (same as everything else in `trancheBookStore.ts`)
— it is not enforced on-chain. An "expired" ask/bid just stops accepting new
bids/funding in the UI; anything already placed before expiry is unaffected.

### Verified live (rewire)
Reused the existing 5000 XRP "OOO" tranche from the first version's test data (which
predates `expiresAt`, correctly rendered as "No expiry"): confirmed the blanc-cassé panel
and serif headline render, clicking a row updates the URL to `#/orderbook/bid-...`, the page
shows the Ask row + Bids depth list side by side, and placing a new 300 XRP bid with the
default "24 hours" duration correctly showed "23h left" once the shared store refreshed.

---

## 4. Finance Bonds table (Morpho-inspired)

Requested with a full, precise spec: port the row layout from `app.morpho.org/vaults`
(bank logo, bank name with middle-truncation, best yield, liquidity with a fiat line,
countdown-to-close, chevron affordance, every cell its own `<a>`) to the "Finance Bonds"
tab, one row per **bank** rather than per tranche — the highest-yield offer from each bank
that's currently raising, with a filter bar (Jurisdiction, Currency, Rating, Sort by).

### Deviations from the literal spec, and why
- **href**: the spec's `/issuer/{slug}/offer/{id}` path has nothing behind it in this
  app (no router, no such route). Rows link to `#/orderbook/{topOfferId}` instead — the
  same per-tranche page the Order Book tab already built (§2/§3) — so the link actually
  goes somewhere instead of 404ing. `App.tsx`'s initial tab now also checks the hash on
  load (`#/orderbook...` → lands on the Order Book tab directly), so a fresh load, reload,
  or middle-click-opened new tab resolves correctly; a same-tab click also flips the active
  tab via a small `onNavigate` callback, skipped for modified clicks (ctrl/cmd/shift/middle)
  so "open in background tab" doesn't also change what the current tab is showing.
- **Logo**: an emoji in a round div, not an `<img>` — `BankProfile` stores `logoEmoji`, not
  an image URL.
- **Currency / fiat line**: this project is XRP-only (RLUSD was explicitly ruled out
  earlier, see the discussion above this doc). Currency is hardcoded to XRP and the "$"
  line uses a static placeholder rate (`XRP_USD_RATE` in `frontend/src/lib/bankBondFormat.ts`)
  since there's no live price oracle here — clearly labeled as such in the code, not a real
  feed.
- **Liquidity**: the tranche's *remaining* capacity (target minus already-deposited), not
  the original full size — matches what "can I still fund this" actually means for a
  partially-filled AT1 tranche, which Morpho's vaults don't have an equivalent of.
- **Skeleton**: 6 rows, not 30 — this app typically has a handful of open tranches, not
  Morpho's much larger vault list; 30 skeleton rows would look wrong for the real data size.
- Colors/fonts follow the app's existing CSS variables; the fetched Morpho page carried no
  CSS to copy from, so these were free choices, matching the surrounding app rather than
  introducing a third visual language (the Order Book's own "blanc cassé" one already being
  the second, deliberately distinct one, from a different reference site).

### New/changed
- `shared/types.ts`: `BankProfile` gained `rating?: string` (freeform, e.g. "AA-",
  self-reported, off-chain — same trust level as everything else in this registry).
- `src/chain/profileStore.ts` + `data/bank-profiles.json`: the four seeded demo profiles
  now carry a rating (Nordic Capital Bank A+, Helios Pension Fund AA-, Meridian Asset
  Management A, AT1 Structuring Desk BBB+).
- `frontend/src/lib/bankProfiles.ts`: new `useProfilesVersion()` hook — bumps whenever any
  cached profile changes, so a parent component can recompute something derived across many
  addresses (here, the Jurisdiction/Rating filter dropdown options) without itself resolving
  any one address. Best-effort: only reflects profiles some row has already fetched.
  `SaveBankProfileInput` gained `rating`.
- `frontend/src/components/BankProfileModal.tsx`: added an optional Credit Rating field.
- `frontend/src/lib/bankBondFormat.ts` (new): `mid` (middle-truncate >30 chars),
  `fmt` (2 decimals; M ≥ 1e6, k ≥ 1e4), `slugify`, `countdownLabel` ("6d 14h" /
  "14h 22m" under 24h / "Closed"), `isUrgent`, `isClosed`, `absoluteLabel`, `toUsd` /
  `XRP_USD_RATE`, `jurisdictionCode` (full country name → 2-letter code for the known seed
  set, best-effort first-two-letters fallback otherwise).
- `frontend/src/components/FinanceBonds.tsx`: fully rewritten — groups open tranches by
  borrower address into one row per bank (`buildBankRows`), a `BankBondRow` subcomponent
  resolves that bank's profile reactively (`useBankProfile`) and hides itself if it doesn't
  match the current Jurisdiction/Rating filter, a `SkeletonTable` renders before the first
  load resolves. The old single-tranche "Fund this Bond" inline flow is gone; funding now
  happens on the tranche's own page (Order Book tab), reached by clicking through.

### Verified live
Filter bar, skeleton, and grouped rows all render correctly against the real devnet data
(three bank rows, correctly ranked by best yield, jurisdiction + rating shown under the
bank name). Clicked a row: URL became `#/orderbook/bid-...`, the nav bar's active tab
switched to "Order Book", and the correct bank's tranche page loaded — confirming the
cross-tab hash-routing fallback works, not just the Order Book tab's own internal
navigation. Set the Rating filter to "A+": list correctly narrowed to just the one
matching bank.

---

## 5. Hyperliquid-style mirrored book, "Maturity" → "Call Date"

Requested with a full display spec (`app.hyperliquid.xyz/trade`'s order book panel,
API-verified where the rendered page couldn't be inspected): replace the tranche page's
single-Ask-row-plus-Bids-list with a real mirrored book — asks above a spread row, bids
below, best prices adjacent to the middle, cumulative "Total" growing outward, depth bars
anchored right, fixed row count so the panel never reflows, row-hover sweep highlight,
row-click prefill. Also: every user-facing "Maturity" label became "Call Date" throughout
(`TrancheBook.tsx`, `TranchePage.tsx`, `IssueBond.tsx`, `App.tsx`) — same underlying
`bid.callDate` field, just the label.

### New — `frontend/src/components/OrderBookPanel.tsx`
Renders the mirrored book for one tranche. Fixed `ROWS_PER_SIDE = 6` per side (Hyperliquid
uses ~11; this app typically has far fewer resting bids, so 6 was enough to demonstrate
padding without a mostly-empty panel), blank rows above/below to hold that count, a spread
row in the middle, tabular-nums monospace figures, depth bars computed exactly per the
spec's formula (`width% = row.total / maxTotalOnThatSide`).

### Deviations from the literal spec, and why
XLS-66 gives every depositor in a vault the same rate — there is no per-lender price
competition (the same point already logged as XRPL DevEx feedback this session). That
single fact drives every deviation here:
- **Only one real ask row.** The tranche's own posted rate/remaining-capacity is the only
  resting ask; there's nothing else to bucket by price. Padded with blanks above it.
- **Bid rows have no distinct price.** Every bid targets the ask's one posted rate, so
  "closest to the spread" is ranked by already-deposited capital first, then size — the
  most real bids first — rather than by price like a real book would.
- **The Spread row is honestly `0.00 / 0.00%`.** There is no rate competition to produce a
  real spread in this variant. This is exactly where a real spread would appear if the
  reverse-auction variant (discussed, not built) were implemented instead.
- **No aggregation-tick or size-unit header controls.** There is only one price level to
  bucket and one unit (XRP) — those controls would be decorative.
- **No websocket/animation-frame throttling.** This panel refreshes on explicit user
  actions (place/fund/originate/refresh), not a live-streaming feed like Hyperliquid's.
- **Rows are keyed by id, not price.** Many bid rows legitimately share the same price
  here; price alone isn't a stable/unique React key in this data model.
- **Lender name moved to a hover tooltip, not a 4th column.** Useful in an institutional
  lending context (unlike an anonymous public exchange book), but the spec is explicitly
  3 columns — kept the name available without breaking that.
- **Row click prefills the bid *amount*, not a price**, since price/rate isn't the
  interesting, variable dimension here — size is. Clicking a peer's bid row (or the ask
  row, to fill the full remaining capacity) copies its size into the "Place a Bid" input.
- Colors/fonts again follow the app's existing CSS variables (red asks / green bids per
  the spec's convention) — no CSS was retrievable from Hyperliquid's client-rendered shell
  to copy from.

### Verified live
Loaded a tranche with a mix of bid states (one deposited, two pending, one with an active
expiry): the mirrored layout, spread row, checkmark on the deposited bid, and cumulative
totals (500 → 2,500 → 2,800) all rendered correctly. Hovering a row visibly highlighted
the sweep from the spread to that row. Clicking a bid row ("300 XRP") correctly wrote
`300` into the "Place a Bid" amount field.

---

## Branches / commits

- `feature/bank-profiles` (`364983e`) — bank profile registry + onboarding.
- `feature/orderBook` (based on `feature/bank-profiles`) — tranche order book:
  `6b913a0` (first version), `80a2f2e` (docs), the rewire described in §3 (per-vault
  pages, two-sided book, expiry, blanc cassé), the Finance Bonds table rewrite in §4, and
  the Hyperliquid-style mirrored book in §5.
- `main` has moved ahead separately with unrelated work (a tmux dev-runner script,
  `fund-and-setup.ts`, a full e2e pipeline run) — neither branch has picked that up yet.
