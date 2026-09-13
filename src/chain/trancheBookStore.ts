// Off-chain order book: shared state so every browser (bank + every LP) sees the same
// tranche list and bid depth, instead of each browser's own localStorage copy. Plain JSON
// file, same pattern as profileStore.ts — no resilience guarantees needed for a demo.
//
// `tranches` mirrors the off-chain-authored fields of a Bid (borrowerName, description,
// urgency, ...); the on-chain vault/loan state is always re-read live from the ledger and
// merged on top by the frontend. `bids` are LP commitments against a tranche (an `Ask`
// with `matchedBidId` pointing at the tranche id) — "pending" until an LP actually funds
// it (real VaultDeposit), then "deposited".
import fs from "node:fs";
import path from "node:path";
import type { Bid, Ask } from "../../shared/types.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "order-book.json");

// RESET_DATA_ON_START (set by `npm run serve`, see src/db/index.ts) — wipe so readStore()
// starts from an empty { tranches: {}, bids: {} } instead of resuming a prior run's file.
if (process.env.RESET_DATA_ON_START && fs.existsSync(STORE_PATH)) {
  fs.rmSync(STORE_PATH);
}

interface Store {
  tranches: Record<string, Bid>;
  bids: Record<string, Ask>;
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

export async function listTranches(): Promise<Bid[]> {
  return Object.values(readStore().tranches);
}

export async function upsertTranche(tranche: Bid): Promise<Bid> {
  if (!tranche?.id) throw new Error("tranche.id is required");
  const store = readStore();
  store.tranches[tranche.id] = tranche;
  writeStore(store);
  return tranche;
}

export async function listBids(trancheId?: string): Promise<Ask[]> {
  const all = Object.values(readStore().bids);
  return trancheId ? all.filter((b) => b.matchedBidId === trancheId) : all;
}

export async function createBid(bid: Ask): Promise<Ask> {
  if (!bid?.id) throw new Error("bid.id is required");
  if (!bid?.matchedBidId) throw new Error("bid.matchedBidId (target tranche id) is required");
  const store = readStore();
  store.bids[bid.id] = bid;
  writeStore(store);
  return bid;
}

export async function updateBidStatus(id: string, status: Ask["status"]): Promise<Ask> {
  const store = readStore();
  const existing = store.bids[id];
  if (!existing) throw new Error(`bid ${id} not found`);
  existing.status = status;
  store.bids[id] = existing;
  writeStore(store);
  return existing;
}
