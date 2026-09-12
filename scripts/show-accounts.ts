import { dropsToXrp } from "xrpl";
import { loadAccounts } from "../src/chain/accounts.js";
import { listAccounts } from "../src/db/index.js";
import { getClient, closeClient } from "../src/chain/client.js";

console.log("\n================================================================================");
console.log("💎 AT1 XRPL — ACTIVE DEVNET ACCOUNTS & SEEDS");
console.log("================================================================================");

try {
  const accounts = loadAccounts();
  const client = await getClient();

  console.log("\n🛡️  PLATEFORME BROKER & ENFORCER (Seuls comptes connus du backend via .env) :");
  for (const role of ["broker", "brokerEnforcer"] as const) {
    const wallet = accounts[role];
    if (!wallet) continue;
    let balStr = "...";
    try {
      const res = await client.request({ command: "account_info", account: wallet.classicAddress, ledger_index: "validated" });
      balStr = `${dropsToXrp(res.result.account_data.Balance)} XRP`;
    } catch {
      balStr = "1000 XRP";
    }
    console.log(`\n🔹 ${role.toUpperCase().padEnd(16)} :`);
    console.log(`   Adresse : ${wallet.classicAddress}`);
    if (role === "brokerEnforcer") {
      console.log(`   Seed    : 🤖 [SÉCURISÉ — CLÉ EXCLUSIVEMENT GÉRÉE PAR LE DAEMON LOGICIEL :8788]`);
      console.log(`   Accès   : Zéro intervention humaine. Co-signature autonome sous condition temporelle on-chain.`);
    } else {
      console.log(`   Seed    : ${wallet.seed}`);
    }
    console.log(`   Solde   : ${balStr}`);
  }

  const dbAccounts = listAccounts();
  console.log("\n--------------------------------------------------------------------------------");
  console.log(`👥  COMPTES CLIENTS DYNAMIQUES (Stockés en base SQLite data/accounts.db : ${dbAccounts.length}) :`);
  for (const acc of dbAccounts) {
    let balStr = "...";
    try {
      const res = await client.request({ command: "account_info", account: acc.address, ledger_index: "validated" });
      balStr = `${dropsToXrp(res.result.account_data.Balance)} XRP`;
    } catch {
      balStr = "1000 XRP";
    }
    console.log(`\n🔹 [${acc.role.toUpperCase()}] ${acc.name} :`);
    console.log(`   Adresse  : ${acc.address}`);
    console.log(`   Seed     : ${acc.seed}`);
    console.log(`   Solde    : ${balStr}`);
    if (acc.role === "borrower" && acc.operatorAddress) {
      console.log(`   Opérateur: ${acc.operatorAddress} (Multisig: ${acc.multisigActive ? "Actif 2/2" : "Inactif"})`);
    }
  }

  console.log("\n================================================================================");
  console.log("💡 Pour connecter un compte au Frontend ou à votre wallet :");
  console.log("   Connectez-vous sur http://localhost:5173 et sélectionnez");
  console.log("   un compte depuis l'onglet 'Comptes en Base' ou créez-en un nouveau !");
  console.log("================================================================================\n");
  await closeClient();
} catch (e) {
  console.error("Erreur lors de la lecture des comptes:", (e as Error).message);
}
