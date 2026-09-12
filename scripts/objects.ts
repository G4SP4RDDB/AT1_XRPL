// Raw count of ledger objects owned by a role (default broker), by type, plus vault ids. Diagnostic.
import { getClient, closeClient } from "../src/chain/client.js";
import { loadAccounts } from "../src/chain/accounts.js";
import { ROLES, type Role } from "../src/chain/config.js";
const role = (process.argv[2] ?? "broker") as Role;
if (!ROLES.includes(role)) throw new Error(`role must be one of ${ROLES.join(", ")}`);
const client = await getClient();
const acct = loadAccounts()[role].classicAddress;
let marker: unknown, all: any[] = [], pages = 0;
do {
  const r: any = await client.request({ command: "account_objects", account: acct, ledger_index: "validated", limit: 400, ...(marker ? { marker } : {}) } as any);
  all.push(...r.result.account_objects); marker = r.result.marker; pages++;
} while (marker);
const by: Record<string, number> = {};
for (const o of all) by[o.LedgerEntryType] = (by[o.LedgerEntryType] ?? 0) + 1;
console.log(`${role} ${acct}: ${all.length} objects in ${pages} page(s)`, by);
for (const o of all.filter((o) => o.LedgerEntryType === "Vault")) console.log("  Vault", o.index, "AssetsTotal", o.AssetsTotal ?? 0);
await closeClient();
