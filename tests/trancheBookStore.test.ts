import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Ask, Bid } from "../shared/types.js";

// trancheBookStore.ts resolves its data directory from process.cwd() at import time, so isolate
// this suite in a fresh temp directory rather than touching the real data/order-book.json.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trancheBookStore-test-"));
const originalCwd = process.cwd();
process.chdir(tmpDir);
const book = await import("../src/chain/trancheBookStore.js");
process.chdir(originalCwd);

function makeAsk(over: Partial<Ask> = {}): Ask {
  return {
    id: `ask-${Math.random().toString(36).slice(2)}`,
    borrowerAddress: "rBorrower",
    amount: "1000",
    yieldRate: 8,
    callDate: "2026-12-31T00:00:00.000Z",
    status: "open",
    ...over,
  };
}

function makeBid(askId: string, over: Partial<Bid> = {}): Bid {
  return {
    id: `bid-${Math.random().toString(36).slice(2)}`,
    lenderAddress: "rLender",
    amount: "500",
    indicated: true,
    matchedAskId: askId,
    status: "pending",
    ...over,
  };
}

test("accepting the first bid pins the tranche's rate to that bid's targetYield", async () => {
  const ask = await book.upsertAsk(makeAsk({ yieldRate: 8 }));
  const bid = await book.createBid(makeBid(ask.id, { targetYield: 6.5 }));

  const accepted = await book.acceptBid(bid.id);
  assert.equal(accepted.status, "accepted");

  const [updatedAsk] = (await book.listAsks()).filter((a) => a.id === ask.id);
  assert.equal(updatedAsk.yieldRate, 6.5);
});

test("accepting a second bid at a different rate is refused once the tranche's rate is pinned", async () => {
  const ask = await book.upsertAsk(makeAsk({ yieldRate: 8 }));
  const winner = await book.createBid(makeBid(ask.id, { targetYield: 6 }));
  const loser = await book.createBid(makeBid(ask.id, { targetYield: 7 }));

  await book.acceptBid(winner.id);
  await assert.rejects(() => book.acceptBid(loser.id));
});

test("accepting a bid auto-declines any other pending bid at a different rate", async () => {
  const ask = await book.upsertAsk(makeAsk({ yieldRate: 8 }));
  const winner = await book.createBid(makeBid(ask.id, { targetYield: 6 }));
  const mismatched = await book.createBid(makeBid(ask.id, { targetYield: 7 }));
  const matching = await book.createBid(makeBid(ask.id, { targetYield: 6 }));

  await book.acceptBid(winner.id);

  const bids = await book.listBids(ask.id);
  assert.equal(bids.find((b) => b.id === mismatched.id)?.status, "declined");
  assert.equal(bids.find((b) => b.id === matching.id)?.status, "pending");
});

test("declining a pending bid marks it declined, and it can never be accepted afterwards", async () => {
  const ask = await book.upsertAsk(makeAsk());
  const bid = await book.createBid(makeBid(ask.id, { targetYield: 5 }));

  const declined = await book.declineBid(bid.id);
  assert.equal(declined.status, "declined");
  await assert.rejects(() => book.acceptBid(bid.id));
});

test("acceptBid and declineBid refuse a bid that is not pending", async () => {
  const ask = await book.upsertAsk(makeAsk());
  const bid = await book.createBid(makeBid(ask.id, { targetYield: 5 }));
  await book.acceptBid(bid.id);

  await assert.rejects(() => book.acceptBid(bid.id));
  await assert.rejects(() => book.declineBid(bid.id));
});
