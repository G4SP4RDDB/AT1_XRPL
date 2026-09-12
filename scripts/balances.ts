// Print on-ledger balance and owner count for every role in .env.
import { getClient, closeClient } from "../src/chain/client.js";
import { loadAccounts } from "../src/chain/accounts.js";
import { dropsToXrp } from "xrpl";

const client = await getClient();
for (const [role, w] of Object.entries(loadAccounts())) {
  try {
    const r = await client.request({ command: "account_info", account: w.classicAddress, ledger_index: "validated" });
    console.log(`${role.padEnd(15)} ${w.classicAddress}  ${dropsToXrp(r.result.account_data.Balance)} XRP  objects=${r.result.account_data.OwnerCount}  seq=${r.result.account_data.Sequence}`);
  } catch (e) {
    console.log(`${role.padEnd(15)} ${w.classicAddress}  ${(e as any).data?.error ?? (e as Error).message}`);
  }
}
await closeClient();
