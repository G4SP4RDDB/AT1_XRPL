import { getClient, closeClient } from "../src/chain/client.js";
import { loadAccounts } from "../src/chain/accounts.js";
import { enforcerWallet } from "../src/chain/enforcer/index.js";
import { submit } from "../src/chain/tx.js";

const client = await getClient();
const A = loadAccounts();
const op = A.borrowerOp;
const enf = enforcerWallet();

console.log("Setting up borrower multisig:");
console.log("  Borrower:   ", A.borrower.classicAddress);
console.log("  BorrowerOp: ", op.classicAddress);
console.log("  Enforcer:   ", enf.classicAddress);

const ai = await client.request({ command: "account_info", account: A.borrower.classicAddress, ledger_index: "validated" });
const masterDisabled = ((ai.result.account_data.Flags ?? 0) & 0x00100000) !== 0;

if (!masterDisabled) {
  const sl = await submit(client, {
    TransactionType: "SignerListSet",
    Account: A.borrower.classicAddress,
    SignerQuorum: 2,
    SignerEntries: [
      { SignerEntry: { Account: op.classicAddress, SignerWeight: 1 } },
      { SignerEntry: { Account: enf.classicAddress, SignerWeight: 1 } },
    ],
  }, A.borrower);
  console.log("SignerListSet result:", sl.result, sl.hash);

  const dm = await submit(client, {
    TransactionType: "AccountSet",
    Account: A.borrower.classicAddress,
    SetFlag: 4, // asfDisableMaster
  }, A.borrower);
  console.log("AccountSet (disable master) result:", dm.result, dm.hash);
} else {
  console.log("Borrower master key already disabled and multisig configured.");
}

await closeClient();
