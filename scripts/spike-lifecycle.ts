// S1 + S2 in one lifecycle on fresh ledger objects. Prints one row per step and writes docs/spike-results.md.
import fs from "node:fs";
import { Wallet, xrpToDrops, signLoanSetByCounterparty, combineLoanSetCounterpartySigners } from "xrpl";
import { getClient, closeClient } from "../src/chain/client.js";
import { loadAccounts } from "../src/chain/accounts.js";
import { DEMO_LOAN, DEMO_BROKER } from "../src/chain/config.js";
import { submit, submitMultisigned, submitBlob, createdId, type Receipt } from "../src/chain/tx.js";
import { vaultInfo, ledgerEntry, shareBalance, xrpBalance, ledgerCloseTime } from "../src/chain/read.js";

const client = await getClient();
const A = loadAccounts();
const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\n").filter(Boolean).map((l) => l.split("=")));
const borrowerOp = Wallet.fromSeed(env.SPARE1_SEED); // borrower-op key (the borrower seed becomes a disabled master)
const enforcer = A.brokerEnforcer;

const spare2 = Wallet.fromSeed(env.SPARE2_SEED);
const rows: Array<{ step: string; result: string; hash: string; note: string }> = [];
function log(step: string, r: Receipt | { result: string; hash?: string }, note = "") {
  rows.push({ step, result: r.result, hash: r.hash ?? "", note });
  console.log(`${step.padEnd(42)} | ${r.result.padEnd(24)} | ${(r.hash ?? "").slice(0, 12)} | ${note}`);
}
const drops = (n: number) => String(Math.ceil(n));

// ---------- 1. Vault ----------
// The broker signs with its own single key (BROKER_SEED); only borrower/lender accounts go multisig.
const vc = await submit(client, { TransactionType: "VaultCreate", Account: A.broker.classicAddress, Asset: { currency: "XRP" }, Data: Buffer.from("AT1 bond #1 BSA Degen").toString("hex") }, A.broker);
const vaultId = createdId(vc.meta, "Vault")!;
log("1 VaultCreate (broker)", vc, `vaultId ${vaultId?.slice(0, 10)}`);
let v = await vaultInfo(client, vaultId);
const shareMptId = v.shareMptId;

// ---------- 2. Broker + cover ----------
const bs = await submit(client, { TransactionType: "LoanBrokerSet", Account: A.broker.classicAddress, VaultID: vaultId, ManagementFeeRate: DEMO_BROKER.managementFeeRate, CoverRateMinimum: DEMO_BROKER.coverRateMinimum, CoverRateLiquidation: DEMO_BROKER.coverRateLiquidation }, A.broker);
const loanBrokerId = createdId(bs.meta, "LoanBroker")!;
log("2 LoanBrokerSet (broker)", bs, `loanBrokerId ${loanBrokerId?.slice(0, 10)}`);
const cd = await submit(client, { TransactionType: "LoanBrokerCoverDeposit", Account: A.broker.classicAddress, LoanBrokerID: loanBrokerId, Amount: xrpToDrops(DEMO_BROKER.coverDepositXrp) }, A.broker);
log("2b LoanBrokerCoverDeposit 150 XRP", cd);

// ---------- 3. Deposit (top up lender first: reserve is 10 + 2 per object on this devnet) ----------
const lenderBal = await xrpBalance(client, A.lender1.classicAddress);
if (lenderBal < DEMO_LOAN.principalXrp + 50) {
  const top = await submit(client, { TransactionType: "Payment", Account: spare2.classicAddress, Destination: A.lender1.classicAddress, Amount: xrpToDrops(900) }, spare2);
  log("3a top-up lender1 +900 XRP from spare2", top, `was ${lenderBal} XRP`);
}
const dep = await submit(client, { TransactionType: "VaultDeposit", Account: A.lender1.classicAddress, VaultID: vaultId, Amount: xrpToDrops(DEMO_LOAN.principalXrp) }, A.lender1);
v = await vaultInfo(client, vaultId);
const sharesAfterDeposit = await shareBalance(client, A.lender1.classicAddress, shareMptId);
log("3 VaultDeposit 1000 XRP (lender1)", dep, `shares=${sharesAfterDeposit} total=${v.assetsTotal} avail=${v.assetsAvailable} pps=${v.pps}`);

// ---------- 4. Borrower becomes 2-of-2 multisig ----------
const ai = await client.request({ command: "account_info", account: A.borrower.classicAddress, ledger_index: "validated" });
const masterDisabled = ((ai.result.account_data.Flags ?? 0) & 0x00100000) !== 0;
const sl = masterDisabled ? { result: "skipped: already multisig", hash: "", explorerUrl: "" } : await submit(client, { TransactionType: "SignerListSet", Account: A.borrower.classicAddress, SignerQuorum: 2, SignerEntries: [
  { SignerEntry: { Account: borrowerOp.classicAddress, SignerWeight: 1 } },
  { SignerEntry: { Account: enforcer.classicAddress, SignerWeight: 1 } },
] }, A.borrower);
log("4 SignerListSet quorum 2 (borrower)", sl, `op=${borrowerOp.classicAddress.slice(0, 8)} enf=${enforcer.classicAddress.slice(0, 8)}`);
const dm = masterDisabled ? { result: "skipped: already disabled", hash: "", explorerUrl: "" } : await submit(client, { TransactionType: "AccountSet", Account: A.borrower.classicAddress, SetFlag: 4 }, A.borrower);
log("4b AccountSet asfDisableMaster", dm);
const bypass0 = await submit(client, { TransactionType: "Payment", Account: A.borrower.classicAddress, Destination: A.broker.classicAddress, Amount: "1" }, A.borrower);
log("4c Payment signed by master (expect reject)", bypass0);

// ---------- 5. LoanSet with multisig counterparty ----------
const close = await ledgerCloseTime(client);
const loanSet: any = {
  TransactionType: "LoanSet", Account: A.broker.classicAddress, LoanBrokerID: loanBrokerId, Counterparty: A.borrower.classicAddress,
  PrincipalRequested: xrpToDrops(DEMO_LOAN.principalXrp), InterestRate: DEMO_LOAN.interestRate, CloseInterestRate: DEMO_LOAN.closeInterestRate,
  ClosePaymentFee: xrpToDrops(DEMO_LOAN.closePaymentFeeXrp), PaymentTotal: DEMO_LOAN.paymentTotal, PaymentInterval: DEMO_LOAN.paymentIntervalSec, GracePeriod: DEMO_LOAN.gracePeriodSec,
};
const prepared = await client.autofill(loanSet);
prepared.Fee = String(Number(prepared.Fee) * 5); // 1 + 0 signers + 2 counterparty signatures, with margin
const brokerSigned = A.broker.sign(prepared);
let ls: Receipt;
try {
  const s1 = signLoanSetByCounterparty(borrowerOp, brokerSigned.tx_blob, { multisign: true });
  const s2 = signLoanSetByCounterparty(enforcer, brokerSigned.tx_blob, { multisign: true });
  const combined = combineLoanSetCounterpartySigners([s1.tx, s2.tx]);
  ls = await submitBlob(client, combined.tx_blob);
} catch (e) { ls = { result: `sdk: ${(e as Error).message.slice(0, 100)}`, hash: "", explorerUrl: "" }; }
const loanId = createdId(ls.meta, "Loan");
const borrowerXrpAfterLoan = await xrpBalance(client, A.borrower.classicAddress);
v = await vaultInfo(client, vaultId);
log("5 LoanSet, counterparty Signers[2]", ls, `loanId ${loanId?.slice(0, 10)} borrower=${borrowerXrpAfterLoan} XRP total=${v.assetsTotal} avail=${v.assetsAvailable} pps=${v.pps}`);
if (!loanId) { await finish(); }
const loan0 = await ledgerEntry(client, loanId!);
console.log(`   loan: PeriodicPayment=${loan0.PeriodicPayment} PrincipalOutstanding=${loan0.PrincipalOutstanding} TotalValueOutstanding=${loan0.TotalValueOutstanding} NextDue=${loan0.NextPaymentDueDate} (close ${close}) remaining=${loan0.PaymentRemaining}`);

// ---------- 6. Guardrail: full withdraw while lent out ----------
const wfull = await submit(client, { TransactionType: "VaultWithdraw", Account: A.lender1.classicAddress, VaultID: vaultId, Amount: { mpt_issuance_id: shareMptId, value: sharesAfterDeposit } }, A.lender1);
log("6 VaultWithdraw ALL shares (expect reject)", wfull, `avail=${v.assetsAvailable}`);

// ---------- 7. Coupon, multisigned, before due date ----------
const due = drops(Number(loan0.PeriodicPayment) + Number(loan0.LoanServiceFee ?? 0));
const c1 = await submitMultisigned(client, { TransactionType: "LoanPay", Account: A.borrower.classicAddress, LoanID: loanId, Amount: due }, [borrowerOp, enforcer]);
v = await vaultInfo(client, vaultId);
const loan1 = loanId ? await ledgerEntry(client, loanId) : {};
log("7 LoanPay coupon, 2 of 2, early", c1, `amount=${due} total=${v.assetsTotal} avail=${v.assetsAvailable} pps=${v.pps} remaining=${loan1.PaymentRemaining}`);

// ---------- 8. Bypass: one signature ----------
const c1sig = await submitMultisigned(client, { TransactionType: "LoanPay", Account: A.borrower.classicAddress, LoanID: loanId, Amount: due }, [borrowerOp]);
log("8 LoanPay with 1 signature (expect reject)", c1sig);

// ---------- 9. Yield-only withdraw ----------
const held = Number(await shareBalance(client, A.lender1.classicAddress, shareMptId));
const principalShares = Number(xrpToDrops(DEMO_LOAN.principalXrp)) * Number(v.sharesOutstanding) / Number(v.assetsTotal);
const yieldShares = Math.floor(held - principalShares);
const wy = yieldShares > 0
  ? await submit(client, { TransactionType: "VaultWithdraw", Account: A.lender1.classicAddress, VaultID: vaultId, Amount: { mpt_issuance_id: shareMptId, value: String(yieldShares) } }, A.lender1)
  : { result: "skipped: yieldShares<=0", hash: "", explorerUrl: "" };
v = await vaultInfo(client, vaultId);
log("9 VaultWithdraw yield-only shares", wy, `held=${held} principalShares=${principalShares.toFixed(2)} yieldShares=${yieldShares} avail=${v.assetsAvailable}`);

// ---------- 10. Impair / unimpair ----------
const im = await submit(client, { TransactionType: "LoanManage", Account: A.broker.classicAddress, LoanID: loanId, Flags: 131072 }, A.broker);
v = await vaultInfo(client, vaultId);
log("10 LoanManage tfLoanImpair (broker multisig)", im, `lossUnrealized=${v.lossUnrealized} pps=${v.pps}`);
const un = await submit(client, { TransactionType: "LoanManage", Account: A.broker.classicAddress, LoanID: loanId, Flags: 262144 }, A.broker);
v = await vaultInfo(client, vaultId);
log("10b LoanManage tfLoanUnimpair", un, `lossUnrealized=${v.lossUnrealized} pps=${v.pps}`);

// ---------- 11. Early full repayment, multisigned ----------
const loan2 = await ledgerEntry(client, loanId!);
const before = await xrpBalance(client, A.borrower.classicAddress);
const fullAmt = drops(Number(loan2.PrincipalOutstanding) * (1 + DEMO_LOAN.closeInterestRate / 100000 + 0.01) + Number(xrpToDrops(DEMO_LOAN.closePaymentFeeXrp)));
const full = await submitMultisigned(client, { TransactionType: "LoanPay", Account: A.borrower.classicAddress, LoanID: loanId, Amount: fullAmt, Flags: 131072 }, [borrowerOp, enforcer]);
const after = await xrpBalance(client, A.borrower.classicAddress);
v = await vaultInfo(client, vaultId);
log("11 LoanPay tfLoanFullPayment early, 2 of 2", full, `offered=${fullAmt} cost=${(before - after).toFixed(6)} XRP total=${v.assetsTotal} avail=${v.assetsAvailable} pps=${v.pps}`);

// ---------- 12. Full withdraw now ----------
const held2 = await shareBalance(client, A.lender1.classicAddress, shareMptId);
const lenderBefore = await xrpBalance(client, A.lender1.classicAddress);
const wall = await submit(client, { TransactionType: "VaultWithdraw", Account: A.lender1.classicAddress, VaultID: vaultId, Amount: { mpt_issuance_id: shareMptId, value: held2 } }, A.lender1);
const lenderAfter = await xrpBalance(client, A.lender1.classicAddress);
v = await vaultInfo(client, vaultId);
log("12 VaultWithdraw all shares after close", wall, `shares=${held2} lender +${(lenderAfter - lenderBefore).toFixed(6)} XRP total=${v.assetsTotal}`);

await finish();
async function finish() {
  const md = ["# Spike results, lifecycle run " + new Date().toISOString(), "", `vault ${vaultId}  broker ${loanBrokerId}  loan ${typeof loanId === "string" ? loanId : "-"}`, "", "| step | result | hash | note |", "|---|---|---|---|",
    ...rows.map((r) => `| ${r.step} | ${r.result} | ${r.hash ? `[${r.hash.slice(0, 10)}](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/${r.hash})` : ""} | ${r.note.replace(/\|/g, "/")} |`), ""].join("\n");
  fs.mkdirSync("docs", { recursive: true });
  fs.appendFileSync("docs/spike-results.md", md + "\n");
  await closeClient();
  process.exit(0);
}
