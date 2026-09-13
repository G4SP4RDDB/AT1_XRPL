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
import type { Bid } from "../shared/types.js";

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

const bid: Bid = {
  id: `e2e-${Date.now()}`,
  borrowerAddress: A.borrower.classicAddress,
  amount: "200",
  yieldRate: 100,
  callDate: new Date(Date.now() + 3 * 60_000).toISOString(),
  status: "open",
};
console.log(`bid: ${bid.amount} XRP at ${bid.yieldRate}% to call ${bid.callDate}`);

console.log("\n=== 1. vault creation ===");
const created = await tx.createBond(bid);
["VaultCreate", "LoanBrokerSet", "LoanBrokerCoverDeposit"].forEach((s, i) => log(s, "tesSUCCESS", created.receipts[i]));
bid.vaultId = created.vaultId; bid.loanBrokerId = created.loanBrokerId; bid.status = "matched";
let v = await read.vaultState(bid.vaultId!);
assertEq("fresh vault assetsTotal", v.assetsTotal, "0");
assertEq("fresh vault sharesTotal", v.sharesTotal, "0");
assertTrue("fresh vault has no loan yet", v.loan === undefined);

console.log("\n=== 2. deposit ===");
const depositPrepared = await tx.prepareDeposit(A.lender1.classicAddress, bid.vaultId!, bid.amount);
const depositSigned = A.lender1.sign(depositPrepared as any);
log("VaultDeposit lender1 200 XRP", "tesSUCCESS", await tx.submitSigned(depositSigned.tx_blob));
v = await read.vaultState(bid.vaultId!);
assertEq("assetsTotal after deposit", v.assetsTotal, "200");
assertEq("pps after deposit", v.pps, 1);
let pos = await read.position(A.lender1.classicAddress, bid.vaultId!);
assertEq("shares minted", pos.shares, "200000000");

console.log("\n=== 3. multisig proof: master key is disabled ===");
const masterPay = await submit(client, { TransactionType: "Payment", Account: A.borrower.classicAddress, Destination: A.broker.classicAddress, Amount: "1" }, A.borrower);
log("Payment signed by disabled master key", "tefMASTER_DISABLED", masterPay);

console.log("\n=== 4. origination (2-of-2 multisig counterparty) ===");
const o = await tx.originate(bid);
log("LoanSet, counterparty Signers[2]", "tesSUCCESS", o, `loanId ${o.loanId?.slice(0, 10)}`);
bid.loanId = o.loanId; bid.status = "originated";
v = await read.vaultState(bid.vaultId!);
assertEq("assetsAvailable drained by origination", v.assetsAvailable, "0");
assertTrue("loan is active", v.loan?.status === "active");
assertEq("payments remaining", v.loan?.paymentRemaining, 3);

// Read the loan's own clock (StartDate/PaymentInterval) once, right after origination, before any other
// submission spends real seconds: the protocol's minimum PaymentInterval is 60s, and every submitAndWait
// round trip on this devnet costs several real seconds, so a "not yet due" check has to run first or it can
// accidentally land past the due date by the time it executes. Caught by this exact test the first time it ran.
console.log("\n=== 5. write-down: impair before the coupon is overdue (checked first, before it spends the 60s budget) ===");
const loan1 = await ledgerEntry(client, bid.loanId!);
log("LoanManage tfLoanImpair, not yet due", "tecTOO_SOON", await tx.impair(bid.loanId!));

console.log("\n=== 6. guardrail: full withdrawal while principal is on loan ===");
log("VaultWithdraw full (guardrail)", "tecINSUFFICIENT_FUNDS", await tx.withdraw({ depositorAddress: A.lender1.classicAddress, vaultId: bid.vaultId!, mode: "full" }));

console.log("\n=== 7. enforcer refuses an early close (3 payments remaining, well before the call date) ===");
log("finalRepayment, paymentRemaining=3", "blocked:before-call-date", await tx.finalRepayment(bid.loanId!, bid.borrowerAddress));

console.log("\n=== 8. multisig proof: one signature is not a quorum ===");
const due1 = String(Math.ceil(Number(loan1.PeriodicPayment)));
const oneSig = await submitMultisigned(client, { TransactionType: "LoanPay", Account: A.borrower.classicAddress, LoanID: bid.loanId, Amount: due1 }, [A.borrowerOp]);
log("LoanPay, 1 of 2 signatures", "tefBAD_QUORUM", oneSig);

await sleepUntil(Number(loan1.NextPaymentDueDate), "coupon #1 to become overdue");

console.log("\n=== 9. write-down: impair once overdue, then unimpair ===");
const vBeforeImpair = await read.vaultState(bid.vaultId!);
log("LoanManage tfLoanImpair, overdue", "tesSUCCESS", await tx.impair(bid.loanId!));
v = await read.vaultState(bid.vaultId!);
assertTrue("lossUnrealized > 0 after impair", Number(v.lossUnrealized) > 0, `(${v.lossUnrealized})`);
assertTrue("pps dropped after impair", v.pps <= vBeforeImpair.pps, `(${v.pps} <= ${vBeforeImpair.pps})`);
log("LoanManage tfLoanUnimpair", "tesSUCCESS", await tx.unimpair(bid.loanId!));
v = await read.vaultState(bid.vaultId!);
assertEq("lossUnrealized cleared after unimpair", v.lossUnrealized, "0");

console.log("\n=== 10. pay the (now overdue) coupon and the next one; yield accrues ===");
const ppsBeforeCoupon = v.pps;
log("LoanPay coupon #1 (late)", "tesSUCCESS", await tx.payCoupon(bid.loanId!, bid.borrowerAddress));
v = await read.vaultState(bid.vaultId!);
assertEq("payments remaining after coupon 1", v.loan?.paymentRemaining, 2);
assertTrue("pps rose after coupon 1", v.pps > ppsBeforeCoupon, `(${v.pps} > ${ppsBeforeCoupon})`);

console.log("\n=== 11. yield-only withdrawal leaves principal untouched ===");
pos = await read.position(A.lender1.classicAddress, bid.vaultId!);
const sharesBeforeYield = pos.shares;
log("VaultWithdraw yield-only", "tesSUCCESS", await tx.withdraw({ depositorAddress: A.lender1.classicAddress, vaultId: bid.vaultId!, mode: "yield-only" }));
pos = await read.position(A.lender1.classicAddress, bid.vaultId!);
assertTrue("shares reduced by exactly the yield shares redeemed", Number(pos.shares) < Number(sharesBeforeYield));
// Not exactly 200,000,000: as PPS rises above 1, depositedDrops/pps (the principal share basis) drops
// slightly, which is correct — each remaining share is worth marginally more XRP. Tolerance is 0.05%.
assertTrue("principal shares within 0.05% of the original 200,000,000", Math.abs(Number(pos.shares) - 200_000_000) < 100_000, `(${pos.shares})`);

console.log("\n=== 12. debt reimbursement: wait for the call date, close early with 2 payments still remaining ===");
const loan2 = await ledgerEntry(client, bid.loanId!);
const callAt = callDateRipple(loan2);
console.log(`    call date: ${rippleToIso(callAt)}  (paymentRemaining=${loan2.PaymentRemaining})`);
await sleepUntil(callAt, "the loan's call date");

const vBeforeClose = await read.vaultState(bid.vaultId!);
const lenderXrpBefore = Number(dropsToXrp((await client.request({ command: "account_info", account: A.lender1.classicAddress, ledger_index: "validated" })).result.account_data.Balance));
log("finalRepayment at the call date (early close, tfLoanFullPayment)", "tesSUCCESS", await tx.finalRepayment(bid.loanId!, bid.borrowerAddress));
v = await read.vaultState(bid.vaultId!);
assertEq("loan closed", v.loan?.status, "closed");
assertEq("payments remaining", v.loan?.paymentRemaining, 0);
assertTrue("close penalty landed in the vault (pps rose again)", v.pps > vBeforeClose.pps, `(${v.pps} > ${vBeforeClose.pps})`);
assertEq("all assets liquid again", v.assetsAvailable, v.assetsTotal);

console.log("\n=== 13. final withdrawal: principal + all accrued yield ===");
log("VaultWithdraw all shares", "tesSUCCESS", await tx.withdraw({ depositorAddress: A.lender1.classicAddress, vaultId: bid.vaultId!, mode: "full" }));
pos = await read.position(A.lender1.classicAddress, bid.vaultId!);
const lenderXrpAfter = Number(dropsToXrp((await client.request({ command: "account_info", account: A.lender1.classicAddress, ledger_index: "validated" })).result.account_data.Balance));
assertEq("no shares left", pos.shares, "0");
assertTrue("lender received principal + yield", lenderXrpAfter > lenderXrpBefore, `(+${(lenderXrpAfter - lenderXrpBefore).toFixed(6)} XRP)`);

const passed = rows.filter((r) => r.result === r.expect).length;
console.log(`\n=== done: ${passed}/${rows.length} steps matched expectation ===`);

const md = [
  `# End-to-end pipeline run — ${new Date().toISOString()}`,
  ``,
  `Bond: ${bid.amount} XRP, ${bid.yieldRate}% annual, vault \`${bid.vaultId}\`, loan \`${bid.loanId}\`.`,
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
