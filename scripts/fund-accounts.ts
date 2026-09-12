// F2: create and fund the role accounts from the faucet and persist their seeds to .env.
// Faucet only (port 443); balance verification against rippled happens in check-devnet.
import { ROLES } from "../src/chain/config.js";
import { fundNewAccount, saveSeed } from "../src/chain/accounts.js";

const spares = Number(process.argv[2] ?? 2);
const targets = [...ROLES, ...Array.from({ length: spares }, (_, i) => `spare${i + 1}`)];
for (const role of targets) {
  try {
    const { wallet, balanceXrp } = await fundNewAccount();
    saveSeed(role, wallet.seed!);
    console.log(`${role.padEnd(15)} ${wallet.classicAddress}  ${balanceXrp} XRP`);
  } catch (e) {
    console.error(`${role.padEnd(15)} FAILED: ${(e as Error).message}`);
  }
}
console.log("\nseeds written to .env (gitignored)");
