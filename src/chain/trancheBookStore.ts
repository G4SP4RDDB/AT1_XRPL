// Off-chain bond-posting registry: shared state so every browser sees the same list of asks
// (a borrower's posted terms), instead of each browser's own localStorage copy. Plain JSON file,
// same pattern as profileStore.ts — no resilience guarantees needed for a demo.
//
// Funding a posted ask is a direct VaultDeposit (see chainClient.fundBond) — there is no LP
// bid/offer layer here; that off-chain order-book mechanism (bids, lock/accept/decline) was
// removed after proving unreliable in practice. The on-chain vault/loan state is always re-read
// live from the ledger and merged on top by the frontend.
import fs from "node:fs";
import path from "node:path";
import type { Ask } from "../../shared/types.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "order-book.json");

interface Store {
  tranches: Record<string, Ask>;
}

function readStore(): Store {
  if (!fs.existsSync(STORE_PATH)) return { tranches: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    return { tranches: parsed.tranches ?? {} };
  } catch {
    return { tranches: {} };
  }
}

function writeStore(store: Store): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2) + "\n");
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
