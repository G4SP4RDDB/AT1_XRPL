import { Wallet } from "xrpl";
import fs from "node:fs";
import path from "node:path";
import { NETWORK, ROLES, type Role } from "./config.js";

const ENV_PATH = path.resolve(process.cwd(), ".env");

/** Ask the hackathon faucet for a fresh funded account (1000 XRP). Port 443, works on restricted networks. */
export async function fundNewAccount(): Promise<{ wallet: Wallet; balanceXrp: number }> {
  const res = await fetch(NETWORK.faucet, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`faucet ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { account: { address: string; secret: string }; balance: number };
  const wallet = Wallet.fromSeed(body.account.secret);
  if (wallet.classicAddress !== body.account.address) {
    throw new Error(`faucet address ${body.account.address} does not match seed-derived ${wallet.classicAddress}`);
  }
  return { wallet, balanceXrp: body.balance };
}

function readEnv(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function saveSeed(role: string, seed: string): void {
  const env = readEnv();
  env[`${role.toUpperCase()}_SEED`] = seed;
  fs.writeFileSync(ENV_PATH, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
}

/** Top an account up to at least `minXrp` liquid balance using fresh faucet accounts (1000 XRP each). */
export async function ensureBalance(client: import("xrpl").Client, address: string, minXrp: number): Promise<string[]> {
  const { dropsToXrp, xrpToDrops } = await import("xrpl");
  const hashes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await client.request({ command: "account_info", account: address, ledger_index: "validated" });
    const bal = Number(dropsToXrp(r.result.account_data.Balance)) - 10 - 2 * Number(r.result.account_data.OwnerCount ?? 0);
    if (bal >= minXrp) return hashes;
    const { wallet } = await fundNewAccount();
    // The faucet answers before the funding transaction is validated: wait until the account exists on a validated ledger,
    // otherwise autofill reads a stale Sequence and the first Payment fails with tefPAST_SEQ.
    for (let t = 0; t < 20; t++) {
      try { await client.request({ command: "account_info", account: wallet.classicAddress, ledger_index: "validated" }); break; }
      catch { await new Promise((r) => setTimeout(r, 1000)); }
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await client.submitAndWait({ TransactionType: "Payment", Account: wallet.classicAddress, Destination: address, Amount: xrpToDrops(985) } as any, { autofill: true, wallet });
        hashes.push(res.result.hash); break;
      } catch (e) { if (attempt === 1) throw e; await new Promise((r) => setTimeout(r, 2000)); }
    }
  }
  return hashes;
}

/** Wallets for every role, from .env. Throws if one is missing (run `npm run fund`). */
export function loadAccounts(): Record<Role, Wallet> {
  const env = readEnv();
  const out = {} as Record<Role, Wallet>;
  for (const role of ROLES) {
    const seed = env[`${role.toUpperCase()}_SEED`];
    if (!seed) throw new Error(`missing ${role.toUpperCase()}_SEED in .env, run: npm run fund`);
    out[role] = Wallet.fromSeed(seed);
  }
  return out;
}
