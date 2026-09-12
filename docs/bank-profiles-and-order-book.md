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

## Branches / commits

- `feature/bank-profiles` (`364983e`) — bank profile registry + onboarding.
- `feature/orderBook` (based on `feature/bank-profiles`) — tranche order book:
  `6b913a0` (first version), `80a2f2e` (docs), plus the rewire described in §3 (per-vault
  pages, two-sided book, expiry, blanc cassé) on top.
- `main` has moved ahead separately with unrelated work (a tmux dev-runner script,
  `fund-and-setup.ts`, a full e2e pipeline run) — neither branch has picked that up yet.
