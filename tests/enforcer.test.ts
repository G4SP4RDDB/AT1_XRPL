import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, callDateRipple } from "../src/chain/enforcer/index.js";

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
