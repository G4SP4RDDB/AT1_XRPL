// Narrow, documented exception to the broker's multisig-only custody (see brokerOperator.ts):
// xrpl.js's signLoanSetByCounterparty() requires the Account-side signature on a LoanSet to
// already be a plain single TxnSignature/SigningPubKey before it will attach the borrower's
// CounterpartySignature — it has no support for the Account side being a multisig `Signers`
// array. Nothing in the XLS-66 spec appears to forbid combining the two, but the SDK helper
// does, and bypassing it would mean reaching into xrpl.js's unexported internals and hoping the
// devnet accepts a combination that's never been exercised — too risky for a Must-have flow.
//
// So the broker account carries a RegularKey (this seed) in addition to its 2-of-2 SignerList:
// the RegularKey lets one dedicated key sign solo, used ONLY for LoanSet's Account-side signature.
// The master key itself is still permanently disabled (scripts/setup-broker-multisig.ts), so this
// is one extra solo-capable key, isolated to one transaction type, not a return to a master seed.
import fs from "node:fs";
import path from "node:path";
import { Wallet } from "xrpl";

let key: Wallet | undefined;
export function brokerLoanSetWallet(): Wallet {
  if (key) return key;
  const file = path.resolve(process.cwd(), ".broker-loanset.env");
  if (!fs.existsSync(file)) throw new Error("broker LoanSet key: .broker-loanset.env missing (BROKERLOANSET_SEED=...)");
  const m = fs.readFileSync(file, "utf8").match(/^BROKERLOANSET_SEED=(\S+)/m);
  if (!m) throw new Error("broker LoanSet key: BROKERLOANSET_SEED not set in .broker-loanset.env");
  key = Wallet.fromSeed(m[1]);
  return key;
}
