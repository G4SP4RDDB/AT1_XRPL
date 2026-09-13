// The broker's own "operator" signer seat: one leg of the broker account's 2-of-2 multisig
// (the other leg is the platform enforcer, see ./enforcer/index.ts). The broker account's master
// key is disabled once this multisig is set up (scripts/setup-broker-multisig.ts), so this key,
// together with the enforcer key, is what actually authorizes VaultCreate / LoanBrokerSet /
// LoanBrokerCoverDeposit / LoanManage on the broker's behalf. Never stored in .env.
import fs from "node:fs";
import path from "node:path";
import { Wallet } from "xrpl";

let key: Wallet | undefined;
export function brokerOperatorWallet(): Wallet {
  if (key) return key;
  const file = path.resolve(process.cwd(), ".broker-operator.env");
  if (!fs.existsSync(file)) throw new Error("broker operator: .broker-operator.env missing (BROKEROPERATOR_SEED=...)");
  const m = fs.readFileSync(file, "utf8").match(/^BROKEROPERATOR_SEED=(\S+)/m);
  if (!m) throw new Error("broker operator: BROKEROPERATOR_SEED not set in .broker-operator.env");
  key = Wallet.fromSeed(m[1]);
  return key;
}
