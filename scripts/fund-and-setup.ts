import fs from "node:fs";
import path from "node:path";
import { Wallet, dropsToXrp } from "xrpl";
import { fundNewAccount } from "../src/chain/accounts.js";
import { getClient, closeClient } from "../src/chain/client.js";
import { saveAccount, listAccounts } from "../src/db/index.js";

console.log("==========================================================================");
console.log("⚡ Generating Platform Broker & Initializing Devnet Environment");
console.log("==========================================================================");

// 1. Platform Broker & Enforcer (The ONLY seeds stored in .env)
const { wallet: broker } = await fundNewAccount();
const { wallet: brokerEnforcer } = await fundNewAccount();

const envContent = [
  "# Platform Broker & Enforcer (The ONLY keys known and managed by the platform backend)",
  `BROKER_SEED=${broker.seed}`,
  `BROKERENFORCER_SEED=${brokerEnforcer.seed}`,
  "",
].join("\n");

fs.writeFileSync(path.resolve(process.cwd(), ".env"), envContent, { mode: 0o600 });
console.log(`✓ Platform Broker   : ${broker.classicAddress}  (saved to .env)`);
console.log(`✓ Broker Enforcer   : ${brokerEnforcer.classicAddress}  (saved to .env)`);

// 2. Update .enforcer.env
const enforcerEnvPath = path.resolve(process.cwd(), ".enforcer.env");
fs.writeFileSync(
  enforcerEnvPath,
  `BROKER_ADDRESS=${broker.classicAddress}\nENFORCER_SEED=${brokerEnforcer.seed}\n`,
  { mode: 0o600 }
);
console.log("✓ Updated .enforcer.env with broker and enforcer credentials.");

// 3. Initialize Demo Clients in SQLite DB if DB is empty
if (listAccounts().length === 0) {
  console.log("\n📦 Initializing sample borrower and lenders in SQLite database (data/accounts.db)...");
  
  // Sample Borrower + Operator Key
  const { wallet: borrowerWallet } = await fundNewAccount();
  const borrowerOp = Wallet.generate();
  saveAccount({
    address: borrowerWallet.classicAddress,
    role: "borrower",
    name: "Borrower (Corporate Issuer)",
    seed: borrowerWallet.seed!,
    company: "AT1 Corporate Issuer",
    firstName: "Alexandre",
    userRole: "Directeur Financier (CFO)",
    operatorAddress: borrowerOp.classicAddress,
    operatorSeed: borrowerOp.seed,
    multisigActive: 0,
    createdAt: new Date().toISOString(),
  });
  console.log(`✓ Sample Borrower saved to SQLite: ${borrowerWallet.classicAddress} (Operator: ${borrowerOp.classicAddress})`);

  // Sample Lender 1
  const { wallet: lender1Wallet } = await fundNewAccount();
  saveAccount({
    address: lender1Wallet.classicAddress,
    role: "lender",
    name: "Lender 1 (Primary Investor)",
    seed: lender1Wallet.seed!,
    company: "Alpha Asset Management",
    firstName: "Sophie",
    userRole: "Head of Fixed Income",
    multisigActive: 0,
    createdAt: new Date().toISOString(),
  });
  console.log(`✓ Sample Lender 1 saved to SQLite: ${lender1Wallet.classicAddress}`);

  // Sample Lender 2
  const { wallet: lender2Wallet } = await fundNewAccount();
  saveAccount({
    address: lender2Wallet.classicAddress,
    role: "lender",
    name: "Lender 2 (Secondary Investor)",
    seed: lender2Wallet.seed!,
    company: "Omega Yield Fund",
    firstName: "Marc",
    userRole: "Portfolio Manager",
    multisigActive: 0,
    createdAt: new Date().toISOString(),
  });
  console.log(`✓ Sample Lender 2 saved to SQLite: ${lender2Wallet.classicAddress}`);
}

console.log("\n⏳ Waiting for broker accounts to validate on the XRP Ledger...");
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
  waitForAccount(brokerEnforcer.classicAddress),
  waitForAccount(broker.classicAddress),
]);

console.log("✓ Platform Broker & Enforcer validated on ledger.");
console.log("\n==========================================================================");
console.log("💎 SETUP COMPLETE: Only Broker in .env, All Clients in SQLite Database");
console.log("==========================================================================\n");

await closeClient();
