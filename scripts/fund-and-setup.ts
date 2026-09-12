import fs from "node:fs";
import path from "node:path";
import { Wallet, dropsToXrp } from "xrpl";
import { ROLES } from "../src/chain/config.js";
import { fundNewAccount, saveSeed } from "../src/chain/accounts.js";
import { getClient, closeClient } from "../src/chain/client.js";
import { submit } from "../src/chain/tx.js";

console.log("==========================================================================");
console.log("⚡ Generating & Funding Fresh Devnet Roles (Custom Hackathon Devnet)");
console.log("==========================================================================");

const spares = 2;
const targets = [...ROLES, ...Array.from({ length: spares }, (_, i) => `spare${i + 1}`)];
const fundedWallets = new Map<string, Wallet>();

for (const role of targets) {
  try {
    const { wallet, balanceXrp } = await fundNewAccount();
    saveSeed(role, wallet.seed!);
    fundedWallets.set(role, wallet);
    console.log(`✓ ${role.padEnd(16)} ${wallet.classicAddress}  (${balanceXrp} XRP)`);
  } catch (e) {
    console.error(`✗ ${role.padEnd(16)} FAILED: ${(e as Error).message}`);
    throw e;
  }
}

const broker = fundedWallets.get("broker")!;
const brokerEnforcer = fundedWallets.get("brokerEnforcer")!;
const borrower = fundedWallets.get("borrower")!;
const borrowerOp = fundedWallets.get("borrowerOp")!;

// Update .enforcer.env
const enforcerEnvPath = path.resolve(process.cwd(), ".enforcer.env");
fs.writeFileSync(
  enforcerEnvPath,
  `BROKER_ADDRESS=${broker.classicAddress}\nENFORCER_SEED=${brokerEnforcer.seed}\n`,
  { mode: 0o600 }
);
console.log("\n✓ Updated .enforcer.env with new broker and enforcer credentials.");

console.log("\n⏳ Waiting for accounts to validate on the XRP Ledger...");
const client = await getClient();

async function waitForAccount(address: string, maxAttempts = 25): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await client.request({ command: "account_info", account: address, ledger_index: "validated" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Account ${address} never appeared on validated ledger`);
}

await Promise.all([
  waitForAccount(borrower.classicAddress),
  waitForAccount(borrowerOp.classicAddress),
  waitForAccount(brokerEnforcer.classicAddress),
  waitForAccount(broker.classicAddress),
]);

console.log("✓ Accounts validated on ledger.");

console.log("\n💡 Le multisig n'est plus automatisé ici : l'emprunteur renseigne son rôle et son prénom lors de sa connexion pour l'activer.");

console.log("\n==========================================================================");
console.log("💎 NEWLY CREATED & CONFIGURED ACCOUNTS");
console.log("==========================================================================");

for (const [role, w] of fundedWallets.entries()) {
  let balStr = "1000 XRP";
  try {
    const res = await client.request({ command: "account_info", account: w.classicAddress, ledger_index: "validated" });
    balStr = `${dropsToXrp(res.result.account_data.Balance)} XRP`;
  } catch {
    // fallback
  }
  console.log(`${role.padEnd(16)} : ${w.classicAddress} | seed: ${w.seed} | ${balStr}`);
}
console.log("==========================================================================\n");

await closeClient();
