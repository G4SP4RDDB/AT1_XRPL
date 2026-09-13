import { test } from "node:test";
import assert from "node:assert/strict";
import { termsFromAsk } from "../src/chain/ops.js";
import { isoToRipple } from "../src/chain/loanMath.js";
import { DEMO_LOAN } from "../src/chain/config.js";

const now = isoToRipple("2026-09-12T17:00:00.000Z");
const ask = (over = {}) => ({ id: "a", borrowerAddress: "r", amount: "1000", yieldRate: 100, callDate: "2026-09-12T17:09:00.000Z", status: "open" as const, ...over });

test("terms: a long schedule of 60 s instalments, independent of the call date (the call date gates principal repayment, not the schedule)", () => {
  const t = termsFromAsk(ask(), now);
  assert.equal(t.principalDrops, 1_000_000_000);
  assert.equal(t.paymentTotal, DEMO_LOAN.paymentTotal);
  assert.equal(t.paymentInterval, 60);
  assert.equal(t.gracePeriod, 60);
  assert.equal(t.interestRate, 100_000);
  // 100 %/yr on 1000 XRP for one 60 s period is ~1,903 drops of interest; over the schedule, minus amortisation effects, a few XRP
  assert.ok(t.interestDrops > 0);
  // the call date does not change the schedule
  assert.equal(termsFromAsk(ask({ callDate: "2026-09-12T17:00:30.000Z" }), now).paymentInterval, 60);
});

test("yield rate above the protocol maximum is clamped", () => {
  assert.equal(termsFromAsk(ask({ yieldRate: 500 }), now).interestRate, 100_000);
});
