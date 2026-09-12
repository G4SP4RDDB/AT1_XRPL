import { getClient, closeClient } from "../src/chain/client.js";
import { Wallet } from "xrpl";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\n").filter(l => l.includes("=")).map(l => l.split("=")));
const client = await getClient();
for (const k of Object.keys(env)) {
  if (!k.endsWith("_SEED")) continue;
  const w = Wallet.fromSeed(env[k]);
  try {
    const r = await client.request({ command: "account_info", account: w.classicAddress, ledger_index: "validated" });
    console.log(k.padEnd(20), w.classicAddress, r.result.account_data.Balance, "drops");
  } catch (e: any) {
    console.log(k.padEnd(20), w.classicAddress, "NOT FUNDED / NOT FOUND:", e.data?.error ?? e.message);
  }
}
await closeClient();
