import { test } from "node:test";
import assert from "node:assert/strict";
import { loanState, splitShares, xrp } from "../src/chain/readLayer.js";
import { fromError, createdId } from "../src/chain/tx.js";

test("xrp converts drops and tolerates absent or invalid values", () => {
  assert.equal(xrp("1000000"), "1");
  assert.equal(xrp(1_000_005_652), "1000.005652");
  assert.equal(xrp(undefined), "0");
  assert.equal(xrp("NaN"), "0");
});

test("loanState maps ledger flags and a closed loan without optional fields", () => {
  const active = loanState({ index: "L", Flags: 0, PrincipalOutstanding: "1000000000", TotalValueOutstanding: "1000011416", PeriodicPayment: "333337138.5", NextPaymentDueDate: 842546873, PaymentRemaining: 3 });
  assert.equal(active.status, "active");
  assert.equal(active.periodicPayment, "333.337139");
  assert.equal(active.nextPaymentDueDate, "2026-09-12T16:47:53.000Z");
  assert.equal(loanState({ index: "L", Flags: 0x00020000, PaymentRemaining: 2 }).status, "impaired");
  assert.equal(loanState({ index: "L", Flags: 0x00010000, PaymentRemaining: 0 }).status, "closed");
  const closed = loanState({ index: "L", PaymentRemaining: 0 });
  assert.equal(closed.status, "closed");
  assert.equal(closed.principalOutstanding, "0");
  assert.equal(closed.nextPaymentDueDate, "");
});

test("loanState: PaymentRemaining omitted entirely (real closed-loan shape) still reads as closed, not active", () => {
  // Regression for the INTEGRATION_CLOSE=1 settlement test: on this devnet a Loan entry read back right after its
  // closing LoanPay carries no PaymentRemaining key at all (rippled omits zero-valued fields), Flags stays 0, and
  // there is no other field that says "closed". Number(undefined) === 0 is false, so this used to fall through to
  // "active" and paymentRemaining came back NaN.
  const closedNoField = loanState({
    index: "L",
    Flags: 0,
    Borrower: "rBorrower",
    LoanBrokerID: "LB",
    PeriodicPayment: "66666920.34516710096",
    StartDate: 842558240,
    PreviousPaymentDueDate: 842558420,
    // PaymentRemaining, PrincipalOutstanding, TotalValueOutstanding, NextPaymentDueDate: all absent, as observed.
  });
  assert.equal(closedNoField.status, "closed");
  assert.equal(closedNoField.paymentRemaining, 0);
  assert.equal(closedNoField.principalOutstanding, "0");
});

test("fromError extracts the engine code the SDK buries in its message", () => {
  assert.equal(fromError(new Error("The latest ledger sequence 70714 is greater... Preliminary result: tefPAST_SEQ")).result, "tefPAST_SEQ");
  assert.equal(fromError(new Error("Transaction failed, tefBAD_QUORUM")).result, "tefBAD_QUORUM");
  assert.ok(fromError(new Error("socket closed")).result.startsWith("error:"));
});

test("splitShares: no yield at deposit time, PPS 1", () => {
  // 200 XRP deposited at PPS 1: 200,000,000 shares minted, none of it is yield yet.
  const { principalShares, yieldShares } = splitShares(200_000_000, 200_000_000, 1);
  assert.equal(principalShares, 200_000_000);
  assert.equal(yieldShares, 0);
});

test("splitShares: a coupon raises PPS and a positive yield share count appears without any share burn", () => {
  const shares = 200_000_000; // unchanged, no shares minted or burned by a coupon
  const depositedDrops = 200_000_000;
  const pps = 1.0028256; // ~ the coupon-1 PPS bump measured against the devnet in spike run 2
  const { yieldShares } = splitShares(shares, depositedDrops, pps);
  assert.ok(yieldShares > 0, `expected positive yieldShares, got ${yieldShares}`);
  assert.ok(yieldShares < shares);
});

test("splitShares: redeeming the yield shares brings the newly computed yieldShares back to ~0, at the same PPS", () => {
  // Regression for the bug the yield-only-withdrawal integration test caught: netting the withdrawn value out of
  // depositedDrops made yieldShares invariant across the withdrawal it was meant to zero out (378 stayed 378).
  const depositedDrops = 200_000_000;
  const pps = 1.0028256;
  const shares = 200_000_000;
  const before = splitShares(shares, depositedDrops, pps);
  assert.ok(before.yieldShares > 0);

  // Burn exactly the yield shares just computed; depositedDrops is untouched because the withdrawal was yield-only.
  const sharesAfter = shares - before.yieldShares;
  const after = splitShares(sharesAfter, depositedDrops, pps);
  assert.ok(after.yieldShares <= 1, `expected yieldShares to collapse to ~0 after redeeming it, got ${after.yieldShares}`);
  assert.ok(after.yieldShares < before.yieldShares);
});

test("splitShares clamps to zero and never goes negative", () => {
  assert.equal(splitShares(0, 200_000_000, 1.5).yieldShares, 0);
  assert.equal(splitShares(100, 200_000_000, 0).yieldShares, 100); // pps 0 (empty vault): no principal basis, all "yield"
  assert.equal(splitShares(100, 0, 1).principalShares, 0);
});

test("createdId finds the created node of the requested type", () => {
  const meta: any = { AffectedNodes: [
    { ModifiedNode: { LedgerEntryType: "AccountRoot" } },
    { CreatedNode: { LedgerEntryType: "MPTokenIssuance", LedgerIndex: "M" } },
    { CreatedNode: { LedgerEntryType: "Vault", LedgerIndex: "V1" } },
  ] };
  assert.equal(createdId(meta, "Vault"), "V1");
  assert.equal(createdId(meta, "Loan"), undefined);
  assert.equal(createdId(undefined, "Vault"), undefined);
});
