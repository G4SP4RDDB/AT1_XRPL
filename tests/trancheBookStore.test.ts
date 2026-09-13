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

test("a bid at or below the ask's ceiling rate auto-accepts on creation and pins the rate", async () => {
  const ask = await book.upsertAsk(makeAsk({ yieldRate: 8 }));
  const bid = await book.createBid(makeBid(ask.id, { targetYield: 6 }));

  assert.equal(bid.status, "accepted");
  const [updatedAsk] = (await book.listAsks()).filter((a) => a.id === ask.id);
  assert.equal(updatedAsk.yieldRate, 6);
});

test("a bid above the ask's ceiling rate stays pending instead of auto-accepting", async () => {
  const ask = await book.upsertAsk(makeAsk({ yieldRate: 8 }));
  const bid = await book.createBid(makeBid(ask.id, { targetYield: 9 }));

  assert.equal(bid.status, "pending");
  const [updatedAsk] = (await book.listAsks()).filter((a) => a.id === ask.id);
  assert.equal(updatedAsk.yieldRate, 8);
});

test("once a rate is pinned, a later bid at or below it also auto-accepts without moving the pin further", async () => {
  const ask = await book.upsertAsk(makeAsk({ yieldRate: 10 }));
  const first = await book.createBid(makeBid(ask.id, { targetYield: 6 }));
  assert.equal(first.status, "accepted");

  const second = await book.createBid(makeBid(ask.id, { targetYield: 5 }));
  assert.equal(second.status, "accepted");

  const [updatedAsk] = (await book.listAsks()).filter((a) => a.id === ask.id);
  assert.equal(updatedAsk.yieldRate, 6, "the pin stays at the first accepted bid's rate, not the second bid's lower one");
});

test("once a rate is pinned, a later bid above it stays pending rather than being auto-declined immediately", async () => {
  const ask = await book.upsertAsk(makeAsk({ yieldRate: 10 }));
  await book.createBid(makeBid(ask.id, { targetYield: 6 })); // pins to 6
  const later = await book.createBid(makeBid(ask.id, { targetYield: 7 }));

  assert.equal(later.status, "pending");
});

test("the borrower can manually accept a pending bid that exceeds the ceiling, pinning the rate to it", async () => {
  const ask = await book.upsertAsk(makeAsk({ yieldRate: 8 }));
  const bid = await book.createBid(makeBid(ask.id, { targetYield: 9 }));
  assert.equal(bid.status, "pending");

  const accepted = await book.acceptBid(bid.id);
  assert.equal(accepted.status, "accepted");
  const [updatedAsk] = (await book.listAsks()).filter((a) => a.id === ask.id);
  assert.equal(updatedAsk.yieldRate, 9);
});

test("accepting a pending bid auto-declines any other pending bid at a different rate", async () => {
  const ask = await book.upsertAsk(makeAsk({ yieldRate: 8 }));
  const winner = await book.createBid(makeBid(ask.id, { targetYield: 9 }));
  const mismatched = await book.createBid(makeBid(ask.id, { targetYield: 9.5 }));
  const matching = await book.createBid(makeBid(ask.id, { targetYield: 9 }));
  assert.equal(winner.status, "pending");
  assert.equal(mismatched.status, "pending");
  assert.equal(matching.status, "pending");

  await book.acceptBid(winner.id);

  const bids = await book.listBids(ask.id);
  assert.equal(bids.find((b) => b.id === mismatched.id)?.status, "declined");
  assert.equal(bids.find((b) => b.id === matching.id)?.status, "pending");

  // the still-pending, rate-matching bid can itself still be manually accepted afterwards
  const secondAccepted = await book.acceptBid(matching.id);
  assert.equal(secondAccepted.status, "accepted");
});

test("accepting a pending bid at a rate that no longer matches the pin is refused", async () => {
  const ask = await book.upsertAsk(makeAsk({ yieldRate: 8 }));
  const winner = await book.createBid(makeBid(ask.id, { targetYield: 9 }));
  await book.acceptBid(winner.id); // pins to 9
  const mismatched = await book.createBid(makeBid(ask.id, { targetYield: 10 })); // 10 > 9, stays pending

  await assert.rejects(() => book.acceptBid(mismatched.id));
});

test("declining a pending bid marks it declined, and it can never be accepted afterwards", async () => {
  const ask = await book.upsertAsk(makeAsk({ yieldRate: 8 }));
  const bid = await book.createBid(makeBid(ask.id, { targetYield: 9 }));
  assert.equal(bid.status, "pending");

  const declined = await book.declineBid(bid.id);
  assert.equal(declined.status, "declined");
  await assert.rejects(() => book.acceptBid(bid.id));
});

test("acceptBid and declineBid refuse a bid that is not pending (e.g. already auto-accepted)", async () => {
  const ask = await book.upsertAsk(makeAsk({ yieldRate: 8 }));
  const bid = await book.createBid(makeBid(ask.id, { targetYield: 5 })); // auto-accepts
  assert.equal(bid.status, "accepted");

  await assert.rejects(() => book.acceptBid(bid.id));
  await assert.rejects(() => book.declineBid(bid.id));
});
