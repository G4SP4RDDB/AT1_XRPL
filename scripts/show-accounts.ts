import { dropsToXrp } from "xrpl";
import { loadAccounts } from "../src/chain/accounts.js";
import { listAccounts } from "../src/db/index.js";
import { getCreatedAccounts } from "../src/chain/createdAccounts.js";
import { getClient, closeClient } from "../src/chain/client.js";
import { brokerOperatorWallet } from "../src/chain/brokerOperator.js";
import { brokerLoanSetWallet } from "../src/chain/brokerLoanSetKey.js";

console.log("\n================================================================================");
console.log("💎 AT1 XRPL — ACTIVE DEVNET ACCOUNTS & SEEDS");
console.log("================================================================================");

try {
  const accounts = loadAccounts();
  const client = await getClient();

  console.log("\n🛡️  PLATEFORME BROKER (le backend ne connaît que son adresse publique, jamais sa clé) :");
  {
    const wallet = accounts.broker;
    let balStr = "...";
    try {
      const res = await client.request({ command: "account_info", account: wallet.classicAddress, ledger_index: "validated" });
      balStr = `${dropsToXrp(res.result.account_data.Balance)} XRP`;
    } catch {
      balStr = "1000 XRP";
    }
    console.log(`\n🔹 BROKER (compte plateforme) :`);
    console.log(`   Adresse       : ${wallet.classicAddress}`);
    console.log(`   Clé maîtresse : ❌ désactivée on-chain (asfDisableMaster) — jamais connue du backend`);
    console.log(`   Solde         : ${balStr}`);
  }
  console.log("\n🔐 CLÉS DE SIGNATURE DU BROKER (les seules détenues par le backend pour ce compte) :");
  for (const [label, wallet, note] of [
    ["Multisig 2/2 — opérateur", (() => { try { return brokerOperatorWallet(); } catch { return undefined; } })(), "VaultCreate / LoanBrokerSet / LoanBrokerCoverDeposit / LoanManage"],
    ["Multisig 2/2 — enforcer", (() => { try { return accounts.brokerEnforcer; } catch { return undefined; } })(), "🤖 co-signature autonome, condition temporelle on-chain, daemon :8788"],
    ["RegularKey — LoanSet seul", (() => { try { return brokerLoanSetWallet(); } catch { return undefined; } })(), "seule exception solo-sig — limite du SDK, voir src/chain/brokerLoanSetKey.ts"],
  ] as const) {
    if (!wallet) {
      console.log(`\n🔹 ${label} : ⏳ pas encore configurée (lance npm run setup:broker-multisig)`);
      continue;
    }
    console.log(`\n🔹 ${label} :`);
    console.log(`   Adresse : ${wallet.classicAddress}`);
    console.log(`   Rôle    : ${note}`);
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
