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
