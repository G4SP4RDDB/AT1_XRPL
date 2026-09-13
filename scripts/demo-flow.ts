// End-to-end run through the PUBLIC chain API (the same calls the frontend makes). One line per step:
//   step | result | hash | explorer
// Usage: npm run demo            (call date 9 minutes ahead; final repayment shows "blocked", then the run stops)
//        npm run demo -- --close (call date now: coupons then a co-signed early close, then full withdrawal)
import { read, tx } from "../src/chain/index.js";
import { loadAccounts, ensureBalance } from "../src/chain/accounts.js";
import { closeClient, getClient } from "../src/chain/client.js";
import type { Bid } from "../shared/types.js";

const closeNow = process.argv.includes("--close");
const A = loadAccounts();
const line = (step: string, r: any, note = "") =>
  console.log(`${step.padEnd(40)} | ${("blocked" in r ? `blocked:${r.blocked}` : r.result).padEnd(24)} | ${(r.hash ?? "").slice(0, 12).padEnd(12)} | ${note}${r.reason ? " " + r.reason : ""}`);

const bid: Bid = {
  id: `bid-${Date.now()}`, borrowerAddress: A.borrower.classicAddress, amount: "1000", yieldRate: 100,
  callDate: new Date(Date.now() + (closeNow ? 3 * 60_000 : 9 * 60_000)).toISOString(), status: "open",
};
console.log(`bid ${bid.id}: ${bid.amount} XRP at ${bid.yieldRate} % to call ${bid.callDate}`);
const client = await getClient();
for (const [role, min] of [["lender1", 1050], ["broker", 300], ["borrower", 60]] as const) {
  const h = await ensureBalance(client, A[role].classicAddress, min);
  if (h.length) console.log(`   topped up ${role} with ${h.length} faucet account(s)`);
}

const created = await tx.createBond(bid);
created.receipts.forEach((r, i) => line(`1.${i} createBond ${["VaultCreate", "LoanBrokerSet", "CoverDeposit"][i]}`, r));
bid.vaultId = created.vaultId; bid.loanBrokerId = created.loanBrokerId; bid.status = "matched";
let v = await read.vaultState(bid.vaultId);
console.log(`   vault ${bid.vaultId.slice(0, 10)} cap-aware, callDate ${v.callDate}`);

const depositPrepared = await tx.prepareDeposit(A.lender1.classicAddress, bid.vaultId, bid.amount);
const depositSigned = A.lender1.sign(depositPrepared as any);
line("2 deposit lender1 1000 XRP", await tx.submitSigned(depositSigned.tx_blob));
v = await read.vaultState(bid.vaultId);
console.log(`   total=${v.assetsTotal} avail=${v.assetsAvailable} pps=${v.pps}`);

const o = await tx.originate(bid);
line("3 originate LoanSet (2 counterparty sigs)", o, `loanId ${o.loanId?.slice(0, 10)}`);
if (!o.loanId) { console.log("   origination failed, stopping"); await closeClient(); process.exit(1); }
bid.loanId = o.loanId; bid.status = "originated";
v = await read.vaultState(bid.vaultId);
console.log(`   total=${v.assetsTotal} avail=${v.assetsAvailable} pps=${v.pps} loan=${v.loan?.status} due=${v.loan?.nextPaymentDueDate} call=${v.callDate}`);

line("4 withdraw FULL while lent (guardrail)", await tx.withdraw({ depositorAddress: A.lender1.classicAddress, vaultId: bid.vaultId, mode: "full" }));
line("5 payCoupon #1 (enforcer co-signs)", await tx.payCoupon(bid.loanId!, bid.borrowerAddress));
let p = await read.position(A.lender1.classicAddress, bid.vaultId);
console.log(`   position: shares=${p.shares} principal=${p.principalDeposited} value=${p.currentValue} yield=${p.accruedYield} yieldShares=${p.yieldShares}`);
line("6 withdraw yield-only", await tx.withdraw({ depositorAddress: A.lender1.classicAddress, vaultId: bid.vaultId, mode: "yield-only" }));
line("7 finalRepayment (enforcer decides)", await tx.finalRepayment(bid.loanId!, bid.borrowerAddress));
if (closeNow) {
  console.log("   waiting for the call date...");
  await new Promise((r) => setTimeout(r, 3 * 60_000 + 10_000));
  line("7b finalRepayment after call date", await tx.finalRepayment(bid.loanId!, bid.borrowerAddress));
  line("8 withdraw FULL after close", await tx.withdraw({ depositorAddress: A.lender1.classicAddress, vaultId: bid.vaultId, mode: "full" }));
}
v = await read.vaultState(bid.vaultId);
p = await read.position(A.lender1.classicAddress, bid.vaultId);
console.log(`   end: total=${v.assetsTotal} avail=${v.assetsAvailable} pps=${v.pps} loan=${v.loan?.status} remaining=${v.loan?.paymentRemaining} | lender value=${p.currentValue} yield=${p.accruedYield}`);
await closeClient();
