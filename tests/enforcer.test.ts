import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, decideWithdraw, callDateRipple } from "../src/chain/enforcer/index.js";

const BROKER = "rBrokerXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const broker = { Owner: BROKER };
const loan = { LoanBrokerID: "LB", PeriodicPayment: "333337138.5156", LoanServiceFee: "0", LatePaymentFee: "0", NextPaymentDueDate: 1000, PaymentInterval: 180, PaymentRemaining: 3, StartDate: 820 };
const pay = (over: Record<string, unknown> = {}) => ({ TransactionType: "LoanPay", LoanID: "L", Amount: "333337139", ...over });

test("refuses anything that is not a LoanPay", () => {
  const d = decide({ TransactionType: "Payment" }, loan, broker, 900, BROKER);
  assert.equal(d.ok, false); if (!d.ok) assert.equal(d.blocked, "not-loan-pay");
});

test("refuses loans brokered by someone else, or unknown loans", () => {
  const other = decide(pay(), loan, { Owner: "rSomeoneElse" }, 900, BROKER);
  assert.equal(other.ok, false);
  const missing = decide(pay(), undefined, undefined, 900, BROKER);
  assert.equal(missing.ok, false);
});

test("on-time coupon must be exactly PeriodicPayment + LoanServiceFee, rounded up, with no flags", () => {
  assert.equal(decide(pay(), loan, broker, 900, BROKER).ok, true);
  const short = decide(pay({ Amount: "333337138" }), loan, broker, 900, BROKER);
  assert.equal(short.ok, false); if (!short.ok) assert.equal(short.blocked, "wrong-amount");
  const over = decide(pay({ Amount: "400000000" }), loan, broker, 900, BROKER);
  assert.equal(over.ok, false);
  const flagged = decide(pay({ Flags: 0x00040000 }), loan, broker, 900, BROKER);
  assert.equal(flagged.ok, false);
});

test("overdue coupon needs tfLoanLatePayment and at least the base amount plus late fee", () => {
  const lateLoan = { ...loan, LatePaymentFee: "1000000" };
  const noFlag = decide(pay({ Amount: "400000000" }), lateLoan, broker, 1001, BROKER);
  assert.equal(noFlag.ok, false);
  const tooLow = decide(pay({ Amount: "333337139", Flags: 0x00040000 }), lateLoan, broker, 1001, BROKER);
  assert.equal(tooLow.ok, false);
  const ok = decide(pay({ Amount: "340000000", Flags: 0x00040000 }), lateLoan, broker, 1001, BROKER);
  assert.equal(ok.ok, true);
  // equality is not late (fixCleanup3_4_0)
  assert.equal(decide(pay(), loan, broker, 1000, BROKER).ok, true);
});

test("full payment is refused before the call date and allowed after", () => {
  const full = pay({ Amount: "700000000", Flags: 0x00020000 });
  const call = callDateRipple(loan); // 1000 + 180 * 2 = 1360
  assert.equal(call, 1360);
  const early = decide(full, loan, broker, 1359, BROKER);
  assert.equal(early.ok, false); if (!early.ok) assert.equal(early.blocked, "before-call-date");
  assert.equal(decide(full, loan, broker, 1360, BROKER).ok, true);
});

test("callDateRipple does not drift as coupons are paid", () => {
  const afterOne = { ...loan, NextPaymentDueDate: 1180, PaymentRemaining: 2 };
  assert.equal(callDateRipple(afterOne), 1360);
  const closed = { ...loan, PaymentRemaining: 0, PreviousPaymentDueDate: 1360 };
  assert.equal(callDateRipple(closed), 1360);
});

// Vault withdraw tests
const vault = { vaultId: "V1", brokerAddress: BROKER };
const activeLoan = { status: "active", paymentRemaining: 3 };
const closedLoan = { status: "closed", paymentRemaining: 0 };
const position = { yieldShares: "50", shares: "1000" };
const withdrawTx = (shares: string | number, over: Record<string, unknown> = {}) => ({
  TransactionType: "VaultWithdraw",
  Account: "rLender123",
  VaultID: "V1",
  Amount: { mpt_issuance_id: "MPT1", value: String(shares) },
  ...over,
});

test("lender multisig: yield-only withdrawal is co-signed even while loan is active", () => {
  const d = decideWithdraw(withdrawTx(50), vault, activeLoan, position, BROKER);
  assert.equal(d.ok, true);

  const partialYield = decideWithdraw(withdrawTx(20), vault, activeLoan, position, BROKER);
  assert.equal(partialYield.ok, true);
});

test("lender multisig: principal withdrawal is blocked while loan is active before settlement", () => {
  // Requesting 51 shares when only 50 yield shares are available
  const d = decideWithdraw(withdrawTx(51), vault, activeLoan, position, BROKER);
  assert.equal(d.ok, false);
  if (!d.ok) {
    assert.equal(d.blocked, "unauthorized-principal-withdrawal");
    assert.match(d.reason, /principal withdrawal locked/);
  }

  // Requesting all 1000 shares
  const all = decideWithdraw(withdrawTx(1000), vault, activeLoan, position, BROKER);
  assert.equal(all.ok, false);
  if (!all.ok) {
    assert.equal(all.blocked, "unauthorized-principal-withdrawal");
  }
});

test("lender multisig: principal withdrawal is co-signed once loan is closed/settled", () => {
  const d = decideWithdraw(withdrawTx(1000), vault, closedLoan, position, BROKER);
  assert.equal(d.ok, true);
});

test("lender multisig: refuses withdrawal on unbrokered vault or invalid amount", () => {
  const foreignVault = decideWithdraw(withdrawTx(10), { brokerAddress: "rSomeoneElse" }, activeLoan, position, BROKER);
  assert.equal(foreignVault.ok, false);

  const invalidAmt = decideWithdraw(withdrawTx(0), vault, activeLoan, position, BROKER);
  assert.equal(invalidAmt.ok, false);
  if (!invalidAmt.ok) assert.equal(invalidAmt.blocked, "wrong-amount");
});

test("decide routes VaultWithdraw to decideWithdraw cleanly", () => {
  const d = decide(withdrawTx(50), activeLoan, broker, 900, BROKER, { vault, loan: activeLoan, position });
  assert.equal(d.ok, true);
});

