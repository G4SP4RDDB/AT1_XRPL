import { test } from "node:test";
import assert from "node:assert/strict";
import { termsFromAsk } from "../src/chain/ops.js";
import { isoToRipple } from "../src/chain/loanMath.js";

const now = isoToRipple("2026-09-12T17:00:00.000Z");
const ask = (over = {}) => ({ id: "a", borrowerAddress: "r", amount: "1000", yieldRate: 100, callDate: "2026-09-12T17:09:00.000Z", status: "open" as const, ...over });

test("terms spread three payments to the call date", () => {
  const t = termsFromAsk(ask(), now);
  assert.equal(t.principalDrops, 1_000_000_000);
  assert.equal(t.paymentTotal, 3);
  assert.equal(t.paymentInterval, 180);
  assert.equal(t.gracePeriod, 120);
  assert.equal(t.interestRate, 100_000);
  assert.ok(t.interestDrops > 11_400 && t.interestDrops < 11_430);
});

test("a call date too close is clamped to the 60 s protocol minimum and grace never exceeds the interval", () => {
  const t = termsFromAsk(ask({ callDate: "2026-09-12T17:00:30.000Z" }), now);
  assert.equal(t.paymentInterval, 60);
  assert.equal(t.gracePeriod, 60);
});

test("yield rate above the protocol maximum is clamped", () => {
  assert.equal(termsFromAsk(ask({ yieldRate: 500 }), now).interestRate, 100_000);
});
