import { test } from "node:test";
import assert from "node:assert/strict";
import { loanState, xrp } from "../src/chain/readLayer.js";
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

test("fromError extracts the engine code the SDK buries in its message", () => {
  assert.equal(fromError(new Error("The latest ledger sequence 70714 is greater... Preliminary result: tefPAST_SEQ")).result, "tefPAST_SEQ");
  assert.equal(fromError(new Error("Transaction failed, tefBAD_QUORUM")).result, "tefBAD_QUORUM");
  assert.ok(fromError(new Error("socket closed")).result.startsWith("error:"));
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
