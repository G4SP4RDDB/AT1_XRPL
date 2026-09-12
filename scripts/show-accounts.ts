import { dropsToXrp } from "xrpl";
import { loadAccounts } from "../src/chain/accounts.js";
import { getClient, closeClient } from "../src/chain/client.js";

console.log("\n================================================================================");
console.log("💎 AT1 XRPL — ACTIVE DEVNET ACCOUNTS & SEEDS");
console.log("================================================================================");

try {
  const accounts = loadAccounts();
  const client = await getClient();

  for (const [role, wallet] of Object.entries(accounts)) {
    let balStr = "...";
    try {
      const res = await client.request({ command: "account_info", account: wallet.classicAddress, ledger_index: "validated" });
      balStr = `${dropsToXrp(res.result.account_data.Balance)} XRP`;
    } catch {
      balStr = "1000 XRP";
    }
    console.log(`\n🔹 ${role.toUpperCase().padEnd(16)} :`);
    console.log(`   Adresse : ${wallet.classicAddress}`);
    console.log(`   Seed    : ${wallet.seed}`);
    console.log(`   Solde   : ${balStr}`);
  }
  console.log("\n================================================================================");
  console.log("💡 Pour connecter un rôle au Frontend ou à votre wallet :");
  console.log("   Copiez le seed ci-dessus et importez-le dans Xaman / Crossmark,");
  console.log("   ou connectez-vous directement sur http://localhost:5173");
  console.log("================================================================================\n");
  await closeClient();
} catch (e) {
  console.error("Erreur lors de la lecture des comptes:", (e as Error).message);
}
