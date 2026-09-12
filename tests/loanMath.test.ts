import { test } from "node:test";
import assert from "node:assert/strict";
import { periodicRate, periodicPayment, totalInterest, percentToTenthBp, rippleToIso, isoToRipple, RIPPLE_EPOCH } from "../src/chain/loanMath.js";

test("periodicRate scales an annual 1/10 bp rate to one interval", () => {
  // 100 % a year over 180 s
  assert.ok(Math.abs(periodicRate(100_000, 180) - 180 / 31_536_000) < 1e-15);
  assert.equal(periodicRate(0, 180), 0);
});

test("periodicPayment matches the ledger figure from spike run 2 within rounding", () => {
  // 1000 XRP, 100 % annual, 3 x 180 s: ledger stored PeriodicPayment 333337138.515592575
  const p = periodicPayment(1_000_000_000, 100_000, 180, 3);
  assert.ok(Math.abs(p - 333_337_138.5156) < 0.01, `got ${p}`);
});

test("zero-interest loan amortises principal evenly", () => {
  assert.equal(periodicPayment(900, 0, 60, 3), 300);
  assert.equal(totalInterest(900, 0, 60, 3), 0);
});

test("totalInterest for the demo terms is about 11416 drops (ledger TotalValueOutstanding 1000011416)", () => {
  const i = totalInterest(1_000_000_000, 100_000, 180, 3);
  assert.ok(i > 11_400 && i < 11_430, `got ${i}`);
});

test("percentToTenthBp converts and clamps", () => {
  assert.equal(percentToTenthBp(8.5), 8_500);
  assert.equal(percentToTenthBp(100), 100_000);
  assert.equal(percentToTenthBp(250), 100_000);
  assert.equal(percentToTenthBp(-1), 0);
});

test("ripple time round-trips and tolerates missing values", () => {
  const iso = "2026-09-12T17:00:00.000Z";
  assert.equal(rippleToIso(isoToRipple(iso)), iso);
  assert.equal(isoToRipple("2000-01-01T00:00:00.000Z"), 0);
  assert.equal(RIPPLE_EPOCH, 946_684_800);
  assert.equal(rippleToIso(NaN), "");
  assert.equal(rippleToIso(undefined as unknown as number), "");
});
