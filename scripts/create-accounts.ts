import { fundNewAccount } from "../src/chain/accounts.js";
import { getClient } from "../src/chain/client.js";
import { saveAccount, listAccounts } from "../src/db/index.js";
import { dropsToXrp } from "xrpl";

const count = Number(process.argv[2] ?? 4);

console.log(`\n⏳ Generating and funding ${count} fresh accounts from the Custom Hackathon Devnet faucet...\n`);

const accounts: Array<{ address: string; seed: string; balanceXrp: number; name: string }> = [];
const startIdx = listAccounts().length;

for (let i = 1; i <= count; i++) {
  try {
    const { wallet, balanceXrp } = await fundNewAccount();
    const name = `Compte Aléatoire #${startIdx + i}`;
    saveAccount({
      address: wallet.classicAddress,
      role: "unassigned",
      name,
      seed: wallet.seed!,
      multisigActive: 0,
      createdAt: new Date().toISOString(),
    });
    accounts.push({
      address: wallet.classicAddress,
      seed: wallet.seed!,
      balanceXrp,
      name,
    });
    console.log(`[${i}/${count}] Funded ${wallet.classicAddress} with ${balanceXrp} XRP (enregistré en base: ${name})`);
  } catch (err) {
    console.error(`[${i}/${count}] Failed to fund account:`, (err as Error).message);
  }
}

console.log("\nWaiting 4s for ledger validation...");
await new Promise((r) => setTimeout(r, 4000));

try {
  const client = await getClient();
  console.log("\n==========================================================================================");
  console.log("💎 COMPTES ALÉATOIRES CRÉÉS & ENREGISTRÉS EN BASE SQLITE (data/accounts.db)");
  console.log("==========================================================================================");

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
    console.log(`  Rôle    : ⚪ Non assigné (Gérez son rôle librement depuis l'interface ou le profil)`);
    console.log(`  Solde   : ${verifiedBalance}`);
  }
  console.log("\n==========================================================================================");
  console.log("💡 Vous pouvez maintenant attribuer le rôle (Emprunteur ou Prêteur) de chaque compte");
  console.log("   directement depuis le frontend http://localhost:5173 dans l'onglet 'Comptes en Base' !");
  console.log("==========================================================================================\n");
  await client.disconnect();
} catch (e) {
  console.error("Error verifying accounts:", e);
}
