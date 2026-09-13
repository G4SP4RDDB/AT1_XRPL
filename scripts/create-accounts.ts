import { fundNewAccount } from "../src/chain/accounts.js";
import { registerWallet } from "../src/chain/ops.js";
import { getClient } from "../src/chain/client.js";
import { wipeCreatedAccounts, addCreatedAccount } from "../src/chain/createdAccounts.js";
import { dropsToXrp } from "xrpl";

const count = Number(process.argv[2] ?? 4);

console.log(`\n🧹 Wiping previous created accounts (created_accounts.json / created_accounts.txt)...`);
wipeCreatedAccounts();
console.log(`✓ Fichier réinitialisé avec succès.`);

console.log(`\n⏳ Generating and funding ${count} fresh accounts from the Custom Hackathon Devnet faucet...\n`);

const accounts: Array<{ address: string; seed: string; balanceXrp: number; name: string }> = [];

for (let i = 1; i <= count; i++) {
  try {
    const { wallet, balanceXrp } = await fundNewAccount();
    registerWallet(wallet.seed!);
    const name = `Compte Aléatoire #${i}`;
    addCreatedAccount({
      address: wallet.classicAddress,
      seed: wallet.seed!,
      balanceXrp,
      name,
      createdAt: new Date().toISOString(),
    });
    accounts.push({
      address: wallet.classicAddress,
      seed: wallet.seed!,
      balanceXrp,
      name,
    });
    console.log(`[${i}/${count}] Funded ${wallet.classicAddress} with ${balanceXrp} XRP (ajouté dans created_accounts.json: ${name})`);
  } catch (err) {
    console.error(`[${i}/${count}] Failed to fund account:`, (err as Error).message);
  }
}

console.log("\nWaiting 4s for ledger validation...");
await new Promise((r) => setTimeout(r, 4000));

try {
  const client = await getClient();
  console.log("\n==========================================================================================");
  console.log("💎 COMPTES CRÉÉS & ENREGISTRÉS DANS created_accounts.json ET created_accounts.txt");
  console.log("==========================================================================================");
  console.log("ℹ️  Note : La base SQLite accounts.db n'est PAS polluée ; l'enregistrement en base se fera");
  console.log("    uniquement lors de la première connexion et configuration de chaque compte.");

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    let verifiedBalance = `${acc.balanceXrp} XRP`;
    try {
      const info = await client.request({
        command: "account_info",
        account: acc.address,
        ledger_index: "validated",
      });
      verifiedBalance = `${dropsToXrp(info.result.account_data.Balance)} XRP (validated)`;
    } catch {
      verifiedBalance = `${acc.balanceXrp} XRP (pending validation)`;
    }

    console.log(`\n🔹 ${acc.name} :`);
    console.log(`  Adresse : ${acc.address}`);
    console.log(`  Seed    : ${acc.seed}`);
    console.log(`  Rôle    : ⚪ Non assigné (Enregistré en base au 1er onboarding)`);
    console.log(`  Solde   : ${verifiedBalance}`);
  }
  console.log("\n==========================================================================================");
  console.log("💡 Pour utiliser ces comptes :");
  console.log("   Consultez le fichier 'created_accounts.json' ou 'created_accounts.txt' à la racine du projet,");
  console.log("   ou connectez-vous sur http://localhost:5173 !");
  console.log("==========================================================================================\n");
  await client.disconnect();
} catch (e) {
  console.error("Error verifying accounts:", e);
}
