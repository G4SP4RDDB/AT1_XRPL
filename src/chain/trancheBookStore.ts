// Off-chain order book: shared state so every browser (bank + every LP) sees the same
// tranche list and bid depth, instead of each browser's own localStorage copy. Plain JSON
// file, same pattern as profileStore.ts — no resilience guarantees needed for a demo.
//
// `tranches` holds the borrower's posted `Ask` (borrowerName, description, yieldRate, ...);
// the on-chain vault/loan state is always re-read live from the ledger and merged on top by
// the frontend. `bids` are LP offers against a tranche (a `Bid` with `matchedAskId` pointing
// at the tranche id) — "pending" until the borrower accepts or declines it, then "deposited"
// once the accepted LP actually funds (real VaultDeposit).
//
// Accepting a bid is a real state transition now (it pins the tranche's rate and can decline
// other bids), so read-modify-write cycles go through withLock() below: a promise-chain mutex
// serializing every store mutation. All the fs calls here are synchronous with no `await`
// between read and write, so within this one Node process nothing can interleave regardless —
// the lock is a defensive backstop for future changes, not a fix for an active race today.
// It does not protect against multiple server processes sharing this file, same as everywhere
// else in this codebase.
import fs from "node:fs";
import path from "node:path";
import type { Ask, Bid } from "../../shared/types.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "order-book.json");

interface Store {
  tranches: Record<string, Ask>;
  bids: Record<string, Bid>;
}

function readStore(): Store {
  if (!fs.existsSync(STORE_PATH)) return { tranches: {}, bids: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    return { tranches: parsed.tranches ?? {}, bids: parsed.bids ?? {} };
  } catch {
    return { tranches: {}, bids: {} };
  }
}

function writeStore(store: Store): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2) + "\n");
}

let writeLock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => T): Promise<T> {
  const run = writeLock.then(fn, fn);
  writeLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function listAsks(): Promise<Ask[]> {
  return Object.values(readStore().tranches);
}

export async function upsertAsk(tranche: Ask): Promise<Ask> {
  if (!tranche?.id) throw new Error("tranche.id is required");
  const store = readStore();
  store.tranches[tranche.id] = tranche;
  writeStore(store);
  return tranche;
}

export async function listBids(askId?: string): Promise<Bid[]> {
  const all = Object.values(readStore().bids);
  return askId ? all.filter((b) => b.matchedAskId === askId) : all;
}

export async function createBid(bid: Bid): Promise<Bid> {
  if (!bid?.id) throw new Error("bid.id is required");
  if (!bid?.matchedAskId) throw new Error("bid.matchedAskId (target tranche id) is required");
  const store = readStore();
  store.bids[bid.id] = bid;
  writeStore(store);
  return bid;
}

export async function updateBidStatus(id: string, status: Bid["status"]): Promise<Bid> {
  const store = readStore();
  const existing = store.bids[id];
  if (!existing) throw new Error(`bid ${id} not found`);
  existing.status = status;
  store.bids[id] = existing;
  writeStore(store);
  return existing;
}

/** Borrower accepts a pending bid: locks it in (off-chain only — see shared/types.ts's Bid
 *  doc comment), pins the tranche's rate to this bid's targetYield on first acceptance, and
 *  auto-declines any other still-pending bid on the same tranche whose rate no longer matches. */
export async function acceptBid(bidId: string): Promise<Bid> {
  return withLock(() => {
    const store = readStore();
    const bid = store.bids[bidId];
    if (!bid) throw new Error(`bid ${bidId} not found`);
    if (bid.status !== "pending") throw new Error(`bid ${bidId} is not pending (status: ${bid.status})`);
    const askId = bid.matchedAskId;
    if (!askId) throw new Error(`bid ${bidId} has no matchedAskId`);
    const ask = store.tranches[askId];
    if (!ask) throw new Error(`tranche ${askId} not found`);

    const alreadyAccepted = Object.values(store.bids).some((b) => b.matchedAskId === askId && b.status === "accepted");
    if (!alreadyAccepted) {
      if (bid.targetYield != null) ask.yieldRate = bid.targetYield;
      store.tranches[askId] = ask;
    } else if (bid.targetYield != null && bid.targetYield !== ask.yieldRate) {
      throw new Error(`bid ${bidId} rate ${bid.targetYield}% does not match the tranche's already-pinned rate ${ask.yieldRate}%`);
    }

    bid.status = "accepted";
    store.bids[bidId] = bid;

    for (const other of Object.values(store.bids)) {
      if (other.id === bidId || other.matchedAskId !== askId || other.status !== "pending") continue;
      if (other.targetYield != null && other.targetYield !== ask.yieldRate) {
        other.status = "declined";
        store.bids[other.id] = other;
      }
    }

    writeStore(store);
    return bid;
  });
}

/** Borrower declines a pending bid. Terminal: a declined bid can never be funded. */
export async function declineBid(bidId: string): Promise<Bid> {
  return withLock(() => {
    const store = readStore();
    const bid = store.bids[bidId];
    if (!bid) throw new Error(`bid ${bidId} not found`);
    if (bid.status !== "pending") throw new Error(`bid ${bidId} is not pending (status: ${bid.status})`);
    bid.status = "declined";
    store.bids[bidId] = bid;
    writeStore(store);
    return bid;
  });
}
