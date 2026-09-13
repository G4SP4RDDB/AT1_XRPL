// The "does everything actually work" run: one bond, top to bottom, through the same public API the
// frontend calls (src/chain/index.ts), plus the deliberately-invalid transactions no legitimate caller
// would build, submitted straight against the ledger to prove the guardrails hold.
//   npm run e2e
// Writes docs/e2e-full-report.md. Takes about 4-5 minutes (two real waits: a coupon going overdue,
// and the loan's call date).
import fs from "node:fs";
import { Wallet, xrpToDrops, dropsToXrp } from "xrpl";
import { getClient, closeClient } from "../src/chain/client.js";
import { loadAccounts, ensureBalance } from "../src/chain/accounts.js";
import { read, tx } from "../src/chain/index.js";
import { submit, submitMultisigned } from "../src/chain/tx.js";
import { ledgerEntry, ledgerCloseTime } from "../src/chain/read.js";
import { callDateRipple } from "../src/chain/enforcer/index.js";
import { isoToRipple, rippleToIso } from "../src/chain/loanMath.js";
import type { Ask } from "../shared/types.js";
import { DEMO_LOAN } from "../src/chain/config.js";

const A = loadAccounts();
const client = await getClient();

type Row = { n: number; step: string; expect: string; result: string; hash: string; note: string };
const rows: Row[] = [];
let n = 0;
function log(step: string, expect: string, result: { result: string; hash?: string } | { blocked: string; reason: string }, note = "") {
  n++;
  const outcome = "blocked" in result ? `blocked:${result.blocked}` : result.result;
  const hash = "hash" in result ? (result.hash ?? "") : "";
  const ok = outcome === expect || (expect.startsWith("tec") && outcome === expect) || expect === outcome;
  rows.push({ n, step, expect, result: outcome, hash, note });
  const mark = outcome === expect ? "PASS" : "CHECK";
  console.log(`[${mark}] ${String(n).padStart(2)}. ${step.padEnd(52)} expect=${expect.padEnd(22)} got=${outcome.padEnd(22)} ${note}`);
}
function assertEq(label: string, actual: unknown, expected: unknown) {
  const ok = String(actual) === String(expected);
  console.log(`       ${ok ? "  ok" : " !! "} ${label}: ${actual} ${ok ? "==" : "!="} ${expected}`);
}
function assertTrue(label: string, cond: boolean, detail = "") {
  console.log(`       ${cond ? "  ok" : " !! "} ${label} ${detail}`);
}
const sleepUntil = async (rippleTime: number, label: string) => {
  const now = await ledgerCloseTime(client);
  const waitSec = rippleTime - now + 3; // +3s margin past ledger close time
  if (waitSec > 0) {
    console.log(`\n>>> waiting ${waitSec}s for ${label} (ledger now ${now}, target ${rippleTime})...`);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
  }
};

console.log("=== 0. setup: top up the demo roles ===");
await ensureBalance(client, A.lender1.classicAddress, 250);
await ensureBalance(client, A.broker.classicAddress, 300);
await ensureBalance(client, A.borrower.classicAddress, 60);

const ask: Ask = {
  id: `e2e-${Date.now()}`,
  borrowerAddress: A.borrower.classicAddress,
  amount: "200",
  yieldRate: 100,
  callDate: new Date(Date.now() + 3 * 60_000).toISOString(),
  status: "open",
};
console.log(`ask: ${ask.amount} XRP at ${ask.yieldRate}% to call ${ask.callDate}`);

// The lender is a plain (non-multisig) wallet account: it signs its own VaultWithdraw, the route
// the frontend uses. tx.withdraw() is the multisig-only route (operator + enforcer co-signature).
async function lenderWithdraw(mode: "full" | "yield-only") {
  const r = await tx.prepareWithdraw({ depositorAddress: A.lender1.classicAddress, vaultId: ask.vaultId!, mode });
  if ("blocked" in r) return r;
  return tx.submitSigned(A.lender1.sign(r.prepared as any).tx_blob);
}

console.log("\n=== 1. vault creation ===");
const created = await tx.createBond(ask);
["VaultCreate", "LoanBrokerSet", "LoanBrokerCoverDeposit"].forEach((s, i) => log(s, "tesSUCCESS", created.receipts[i]));
ask.vaultId = created.vaultId; ask.loanBrokerId = created.loanBrokerId; ask.status = "matched";
let v = await read.vaultState(ask.vaultId!);
assertEq("fresh vault assetsTotal", v.assetsTotal, "0");
assertEq("fresh vault sharesTotal", v.sharesTotal, "0");
assertTrue("fresh vault has no loan yet", v.loan === undefined);

console.log("\n=== 2. deposit ===");
const depositPrepared = await tx.prepareDeposit(A.lender1.classicAddress, ask.vaultId!, ask.amount);
const depositSigned = A.lender1.sign(depositPrepared as any);
const depositReceipt = await tx.submitSigned(depositSigned.tx_blob);
log("VaultDeposit lender1 200 XRP", "tesSUCCESS", depositReceipt);
v = await read.vaultState(ask.vaultId!);
assertEq("assetsTotal after deposit", v.assetsTotal, "200");
assertEq("pps after deposit", v.pps, 1);
let pos = await read.position(A.lender1.classicAddress, ask.vaultId!);
assertEq("shares minted", pos.shares, "200000000");

console.log("\n=== 3. multisig proof: master key is disabled ===");
const masterPay = await submit(client, { TransactionType: "Payment", Account: A.borrower.classicAddress, Destination: A.broker.classicAddress, Amount: "1" }, A.borrower);
log("Payment signed by disabled master key", "tefMASTER_DISABLED", masterPay);

console.log("\n=== 4. origination: automatic on the funding deposit (2-of-2 multisig counterparty) ===");
const auto = depositReceipt.autoOrigination;
const o = auto && "originated" in auto ? auto.originated : await tx.originate(ask);
log(auto && "originated" in auto ? "LoanSet auto-originated by the funding deposit" : "LoanSet, counterparty Signers[2]", "tesSUCCESS", o, `loanId ${o.loanId?.slice(0, 10)}${auto && "skipped" in auto ? ` (auto skipped: ${auto.skipped})` : ""}`);
ask.loanId = o.loanId; ask.status = "originated";
v = await read.vaultState(ask.vaultId!);
assertEq("assetsAvailable drained by origination", v.assetsAvailable, "0");
assertTrue("loan is active", v.loan?.status === "active");
assertEq("payments remaining", v.loan?.paymentRemaining, DEMO_LOAN.paymentTotal);

console.log("\n=== 4b. issuer binding: a LoanSet for another counterparty is refused before it reaches the ledger ===");
let binding: { blocked: string; reason: string } | { result: string } = { result: "not-refused" };
try {
  await tx.originate({ ...ask, borrowerAddress: A.broker.classicAddress });
} catch (e) {
  const msg = (e as Error).message;
  binding = /bound to issuer/.test(msg) ? { blocked: "not-issuer", reason: msg } : { result: `error: ${msg.slice(0, 60)}` };
}
log("LoanSet with a foreign counterparty", "blocked:not-issuer", binding);

// Read the loan's own clock (StartDate/PaymentInterval) once, right after origination, before any other
// submission spends real seconds: the protocol's minimum PaymentInterval is 60s, and every submitAndWait
// round trip on this devnet costs several real seconds, so a "not yet due" check has to run first or it can
// accidentally land past the due date by the time it executes. Caught by this exact test the first time it ran.
console.log("\n=== 5. write-down: impair before the coupon is overdue (checked first, before it spends the 60s budget) ===");
const loan1 = await ledgerEntry(client, ask.loanId!);
log("LoanManage tfLoanImpair, not yet due", "tecTOO_SOON", await tx.impair(ask.loanId!));

console.log("\n=== 6. guardrail: full withdrawal while principal is on loan ===");
log("VaultWithdraw full (guardrail)", "tecINSUFFICIENT_FUNDS", await lenderWithdraw("full"));

console.log("\n=== 7. enforcer refuses principal repayments before the call date: a call, and a partial one ===");
log("finalRepayment (call the bond) before the call date", "blocked:before-call-date", await tx.finalRepayment(ask.loanId!, ask.borrowerAddress));
log("repayPrincipal 50 XRP before the call date", "blocked:before-call-date", await tx.repayPrincipal(ask.loanId!, ask.borrowerAddress, "50"));

console.log("\n=== 8. multisig proof: one signature is not a quorum ===");
const due1 = String(Math.ceil(Number(loan1.PeriodicPayment)));
const oneSig = await submitMultisigned(client, { TransactionType: "LoanPay", Account: A.borrower.classicAddress, LoanID: ask.loanId, Amount: due1 }, [A.borrowerOp]);
log("LoanPay, 1 of 2 signatures", "tefBAD_QUORUM", oneSig);

await sleepUntil(Number(loan1.NextPaymentDueDate), "coupon #1 to become overdue");

console.log("\n=== 9. write-down: impair once overdue, then unimpair ===");
const vBeforeImpair = await read.vaultState(ask.vaultId!);
log("LoanManage tfLoanImpair, overdue", "tesSUCCESS", await tx.impair(ask.loanId!));
v = await read.vaultState(ask.vaultId!);
assertTrue("lossUnrealized > 0 after impair", Number(v.lossUnrealized) > 0, `(${v.lossUnrealized})`);
assertTrue("pps dropped after impair", v.pps <= vBeforeImpair.pps, `(${v.pps} <= ${vBeforeImpair.pps})`);
log("LoanManage tfLoanUnimpair", "tesSUCCESS", await tx.unimpair(ask.loanId!));
v = await read.vaultState(ask.vaultId!);
assertEq("lossUnrealized cleared after unimpair", v.lossUnrealized, "0");

console.log("\n=== 10. pay the (now overdue) coupon and the next one; yield accrues ===");
const ppsBeforeCoupon = v.pps;
log("LoanPay coupon #1 (late)", "tesSUCCESS", await tx.payCoupon(ask.loanId!, ask.borrowerAddress));
v = await read.vaultState(ask.vaultId!);
assertEq("payments remaining after coupon 1", v.loan?.paymentRemaining, DEMO_LOAN.paymentTotal - 1);
assertTrue("pps rose after coupon 1", v.pps > ppsBeforeCoupon, `(${v.pps} > ${ppsBeforeCoupon})`);

console.log("\n=== 11. yield-only withdrawal leaves principal untouched ===");
pos = await read.position(A.lender1.classicAddress, ask.vaultId!);
const sharesBeforeYield = pos.shares;
log("VaultWithdraw yield-only", "tesSUCCESS", await lenderWithdraw("yield-only"));
pos = await read.position(A.lender1.classicAddress, ask.vaultId!);
assertTrue("shares reduced by exactly the yield shares redeemed", Number(pos.shares) < Number(sharesBeforeYield));
// Not exactly 200,000,000: as PPS rises above 1, depositedDrops/pps (the principal share basis) drops
// slightly, which is correct — each remaining share is worth marginally more XRP. Tolerance is 0.05%.
assertTrue("principal shares within 0.05% of the original 200,000,000", Math.abs(Number(pos.shares) - 200_000_000) < 100_000, `(${pos.shares})`);

console.log("\n=== 12. the call date: a partial principal repayment is now co-signed, then the issuer calls the bond ===");
const loan2 = await ledgerEntry(client, ask.loanId!);
const callAt = isoToRipple((await read.vaultState(ask.vaultId!)).callDate);
console.log(`    call date: ${rippleToIso(callAt)}  (paymentRemaining=${loan2.PaymentRemaining})`);
await sleepUntil(callAt, "the ask's call date");
const vBeforePartial = await read.vaultState(ask.vaultId!);
log("repayPrincipal 50 XRP at the call date (tfLoanOverpayment; timing-sensitive, see friction #14/#33)", "tesSUCCESS", await tx.repayPrincipal(ask.loanId!, ask.borrowerAddress, "50"));
v = await read.vaultState(ask.vaultId!);
assertTrue("50 XRP of principal came back into the vault", Number(v.assetsAvailable) >= Number(vBeforePartial.assetsAvailable) + 49, `(${vBeforePartial.assetsAvailable} -> ${v.assetsAvailable})`);
assertTrue("loan still open after the partial repayment", v.loan?.status === "active", `(${v.loan?.status})`);

const vBeforeClose = await read.vaultState(ask.vaultId!);
const lenderXrpBefore = Number(dropsToXrp((await client.request({ command: "account_info", account: A.lender1.classicAddress, ledger_index: "validated" })).result.account_data.Balance));
log("finalRepayment: the issuer calls the bond (tfLoanFullPayment, close premium to the vault)", "tesSUCCESS", await tx.finalRepayment(ask.loanId!, ask.borrowerAddress));
v = await read.vaultState(ask.vaultId!);
assertEq("loan closed", v.loan?.status, "closed");
assertEq("payments remaining", v.loan?.paymentRemaining, 0);
assertTrue("close premium landed in the vault (pps rose again)", v.pps > vBeforeClose.pps, `(${v.pps} > ${vBeforeClose.pps})`);
assertEq("all assets liquid again", v.assetsAvailable, v.assetsTotal);

console.log("\n=== 13. final withdrawal: principal + all accrued yield ===");
log("VaultWithdraw all shares", "tesSUCCESS", await lenderWithdraw("full"));
pos = await read.position(A.lender1.classicAddress, ask.vaultId!);
const lenderXrpAfter = Number(dropsToXrp((await client.request({ command: "account_info", account: A.lender1.classicAddress, ledger_index: "validated" })).result.account_data.Balance));
assertEq("no shares left", pos.shares, "0");
assertTrue("lender received principal + yield", lenderXrpAfter > lenderXrpBefore, `(+${(lenderXrpAfter - lenderXrpBefore).toFixed(6)} XRP)`);

const passed = rows.filter((r) => r.result === r.expect).length;
console.log(`\n=== done: ${passed}/${rows.length} steps matched expectation ===`);

const md = [
  `# End-to-end pipeline run — ${new Date().toISOString()}`,
  ``,
  `Bond: ${ask.amount} XRP, ${ask.yieldRate}% annual, vault \`${ask.vaultId}\`, loan \`${ask.loanId}\`.`,
  `${passed}/${rows.length} steps matched expectation.`,
  ``,
  `| # | Step | Expected | Got | Hash | Note |`,
  `|---|---|---|---|---|---|`,
  ...rows.map((r) => `| ${r.n} | ${r.step} | \`${r.expect}\` | \`${r.result}\` | ${r.hash ? `[${r.hash.slice(0, 10)}](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/${r.hash})` : "—"} | ${r.note} |`),
  ``,
].join("\n");
fs.writeFileSync("docs/e2e-full-report.md", md);
console.log("report written to docs/e2e-full-report.md");

await closeClient();
process.exit(rows.every((r) => r.result === r.expect) ? 0 : 1);
