// End-to-end scripted run for the live demo. Fresh accounts each run. One line per step:
//   step | result | hash | explorer
// Steps are filled in as chain/ steps 2.1 to 2.10 land.
const steps: Array<[string, () => Promise<{ result: string; hash: string; explorerUrl: string }>]> = [
  // ["VaultCreate", ...], ["LoanBrokerSet", ...], ["LoanBrokerCoverDeposit", ...], ["VaultDeposit", ...],
  // ["LoanSet (multisig counterparty)", ...], ["LoanPay coupon", ...], ["VaultWithdraw yield-only", ...],
  // ["VaultWithdraw full (expected rejection)", ...], ["LoanPay full before call date, 1 sig (expected rejection)", ...],
  // ["LoanManage impair / unimpair", ...], ["LoanPay full after call date", ...],
];
for (const [name, run] of steps) {
  const r = await run();
  console.log(`${name.padEnd(45)} | ${r.result.padEnd(14)} | ${r.hash} | ${r.explorerUrl}`);
}
if (steps.length === 0) console.log("demo-flow: no steps implemented yet");
