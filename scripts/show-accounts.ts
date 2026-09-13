import { dropsToXrp } from "xrpl";
import { loadAccounts } from "../src/chain/accounts.js";
import { listAccounts } from "../src/db/index.js";
import { getCreatedAccounts } from "../src/chain/createdAccounts.js";
import { getClient, closeClient } from "../src/chain/client.js";

console.log("\n================================================================================");
console.log("💎 AT1 XRPL — ACTIVE DEVNET ACCOUNTS & SEEDS");
console.log("================================================================================");

try {
  const accounts = loadAccounts();
  const client = await getClient();

  console.log("\n🛡️  PLATEFORME (les seules clés détenues par le backend) :");
  for (const [label, wallet, note] of [
    ["BROKER (compte plateforme)", accounts.broker, "clé unique — VaultCreate / LoanBrokerSet / LoanBrokerCoverDeposit / LoanSet / LoanManage"],
    ["ENFORCER", accounts.brokerEnforcer, "🤖 co-signataire 2/2 des comptes borrower/lender — condition temporelle, daemon :8788"],
  ] as const) {
    if (!wallet) {
      console.log(`\n🔹 ${label} : ⏳ pas encore configurée (lance npm run fund:setup)`);
      continue;
    }
    let balStr = "...";
    try {
      const res = await client.request({ command: "account_info", account: wallet.classicAddress, ledger_index: "validated" });
      balStr = `${dropsToXrp(res.result.account_data.Balance)} XRP`;
    } catch {
      balStr = "1000 XRP";
    }
    console.log(`\n🔹 ${label} :`);
    console.log(`   Adresse : ${wallet.classicAddress}`);
    console.log(`   Rôle    : ${note}`);
    console.log(`   Solde   : ${balStr}`);
  }

  const createdAccs = getCreatedAccounts();
  console.log("\n--------------------------------------------------------------------------------");
  console.log(`📋  COMPTES CRÉÉS RÉCENTS (Fichier created_accounts.json : ${createdAccs.length}) :`);
  console.log("    (Financés sur Devnet, prêts à être configurés au 1er onboarding)");
  for (const acc of createdAccs) {
    let balStr = "...";
    try {
      const res = await client.request({ command: "account_info", account: acc.address, ledger_index: "validated" });
      balStr = `${dropsToXrp(res.result.account_data.Balance)} XRP`;
    } catch {
      balStr = `${acc.balanceXrp} XRP`;
    }
    console.log(`\n🔹 ${acc.name} :`);
    console.log(`   Adresse  : ${acc.address}`);
    console.log(`   Seed     : ${acc.seed}`);
    console.log(`   Solde    : ${balStr}`);
    console.log(`   Statut   : ⏳ En attente de setup (enregistré en base à la 1ère connexion)`);
  }

  const dbAccounts = listAccounts();
  console.log("\n--------------------------------------------------------------------------------");
  console.log(`👥  COMPTES CLIENTS ENREGISTRÉS EN BASE (SQLite data/accounts.db : ${dbAccounts.length}) :`);
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
  console.log("💡 Pour connecter un compte au Frontend :");
  console.log("   Connectez-vous sur http://localhost:5173 et sélectionnez un compte créé !");
  console.log("================================================================================\n");
  await closeClient();
} catch (e) {
  console.error("Erreur lors de la lecture des comptes:", (e as Error).message);
}
