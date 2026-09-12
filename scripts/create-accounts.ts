import { fundNewAccount } from "../src/chain/accounts.js";
import { getClient } from "../src/chain/client.js";
import { dropsToXrp } from "xrpl";

const count = Number(process.argv[2] ?? 4);

console.log(`\n⏳ Generating and funding ${count} fresh accounts from the Custom Hackathon Devnet faucet...\n`);

const accounts: Array<{ address: string; seed: string; balanceXrp: number }> = [];

for (let i = 1; i <= count; i++) {
  try {
    const { wallet, balanceXrp } = await fundNewAccount();
    accounts.push({
      address: wallet.classicAddress,
      seed: wallet.seed!,
      balanceXrp,
    });
    console.log(`[${i}/${count}] Funded ${wallet.classicAddress} with ${balanceXrp} XRP`);
  } catch (err) {
    console.error(`[${i}/${count}] Failed to fund account:`, (err as Error).message);
  }
}

console.log("\nWaiting 4s for ledger validation...");
await new Promise((r) => setTimeout(r, 4000));

try {
  const client = await getClient();
  console.log("\n==========================================================================================");
  console.log("💎 CREATED & FUNDED ACCOUNTS (Custom Hackathon Devnet)");
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

    console.log(`\nCompte #${i + 1}:`);
    console.log(`  Adresse : ${acc.address}`);
    console.log(`  Seed    : ${acc.seed}`);
    console.log(`  Solde   : ${verifiedBalance}`);
  }
  console.log("\n==========================================================================================\n");
  await client.disconnect();
} catch (e) {
  console.error("Error verifying accounts:", e);
}
