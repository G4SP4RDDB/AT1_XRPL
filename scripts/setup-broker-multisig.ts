// One-time, IRREVERSIBLE bootstrap: disables the broker account's master key and replaces it with
// a 2-of-2 SignerList (a new "broker operator" key + the platform enforcer key) plus a RegularKey
// reserved for LoanSet signing only (see src/chain/brokerLoanSetKey.ts for why LoanSet needs a
// solo-capable key rather than the SignerList).
//
// Run once, with BROKER_SEED still present in .env — this is the last transaction that seed ever
// signs. After it succeeds:
//   - .env's BROKER_SEED is replaced with BROKER_ADDRESS (public only, never a seed again)
//   - .broker-operator.env and .broker-loanset.env hold the new keys the backend actually signs with
//   - the original BROKER_SEED is permanently useless on-ledger (master key disabled) — safe to discard
import fs from "node:fs";
import path from "node:path";
import { Wallet } from "xrpl";
import { getClient, closeClient } from "../src/chain/client.js";
import { enforcerWallet } from "../src/chain/enforcer/index.js";
import { submit } from "../src/chain/tx.js";

const ENV_PATH = path.resolve(process.cwd(), ".env");
const OPERATOR_ENV_PATH = path.resolve(process.cwd(), ".broker-operator.env");
const LOANSET_ENV_PATH = path.resolve(process.cwd(), ".broker-loanset.env");

function readEnv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
function writeEnv(file: string, env: Record<string, string>) {
  fs.writeFileSync(file, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
}

const env = readEnv(ENV_PATH);
if (!env.BROKER_SEED) throw new Error("BROKER_SEED missing from .env — nothing to migrate (already done?)");
const brokerMaster = Wallet.fromSeed(env.BROKER_SEED);

const client = await getClient();
const enf = enforcerWallet();

const ai = await client.request({ command: "account_info", account: brokerMaster.classicAddress, ledger_index: "validated" });
const masterDisabled = ((ai.result.account_data.Flags ?? 0) & 0x00100000) !== 0;
if (masterDisabled) {
  throw new Error("broker master key is already disabled — this script has already run; nothing to do");
}

const operatorWallet = Wallet.generate();
const loanSetWallet = Wallet.generate();

console.log("Broker:          ", brokerMaster.classicAddress);
console.log("New operator key:", operatorWallet.classicAddress);
console.log("New LoanSet key: ", loanSetWallet.classicAddress);
console.log("Enforcer key:    ", enf.classicAddress);

const sl = await submit(client, {
  TransactionType: "SignerListSet",
  Account: brokerMaster.classicAddress,
  SignerQuorum: 2,
  SignerEntries: [
    { SignerEntry: { Account: operatorWallet.classicAddress, SignerWeight: 1 } },
    { SignerEntry: { Account: enf.classicAddress, SignerWeight: 1 } },
  ],
}, brokerMaster);
console.log("SignerListSet:", sl.result, sl.hash);
if (sl.result !== "tesSUCCESS") throw new Error(`SignerListSet failed: ${sl.result}`);

const rk = await submit(client, {
  TransactionType: "SetRegularKey",
  Account: brokerMaster.classicAddress,
  RegularKey: loanSetWallet.classicAddress,
}, brokerMaster);
console.log("SetRegularKey:", rk.result, rk.hash);
if (rk.result !== "tesSUCCESS") throw new Error(`SetRegularKey failed: ${rk.result}`);

const dm = await submit(client, {
  TransactionType: "AccountSet",
  Account: brokerMaster.classicAddress,
  SetFlag: 4, // asfDisableMaster
}, brokerMaster);
console.log("AccountSet (disable master):", dm.result, dm.hash);
if (dm.result !== "tesSUCCESS") {
  throw new Error(`AccountSet failed: ${dm.result} — SignerList/RegularKey are set but master is still live, re-run is safe`);
}

writeEnv(OPERATOR_ENV_PATH, { BROKEROPERATOR_SEED: operatorWallet.seed! });
writeEnv(LOANSET_ENV_PATH, { BROKERLOANSET_SEED: loanSetWallet.seed! });

const { BROKER_SEED: _discard, ...rest } = env;
writeEnv(ENV_PATH, { ...rest, BROKER_ADDRESS: brokerMaster.classicAddress });

console.log("\nDone. The broker's master key is permanently disabled on-ledger.");
console.log("BROKER_SEED has been removed from .env (replaced with BROKER_ADDRESS).");
console.log("The backend now only holds: the broker operator key, the broker LoanSet RegularKey, and the enforcer key.");

await closeClient();
