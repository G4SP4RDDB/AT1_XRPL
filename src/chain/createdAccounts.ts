import fs from "node:fs";
import path from "node:path";

export interface CreatedAccount {
  address: string;
  seed: string;
  balanceXrp: number | string;
  name: string;
  createdAt: string;
}

const ROOT_JSON_FILE = path.resolve(process.cwd(), "created_accounts.json");
const ROOT_TXT_FILE = path.resolve(process.cwd(), "created_accounts.txt");
const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_JSON_FILE = path.resolve(DATA_DIR, "created_accounts.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

import { Wallet } from "xrpl";

function getBrokerInfo(): { address: string; seed: string } | null {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      const m = content.match(/BROKER_SEED=([^\s]+)/);
      if (m && m[1]) {
        const seed = m[1].trim();
        const wallet = Wallet.fromSeed(seed);
        return { address: wallet.classicAddress, seed };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function writeTxtSummary(accounts: CreatedAccount[]): void {
  const broker = getBrokerInfo();

  const brokerSection = broker
    ? [
        "🛡️  COURTIER PLATEFORME (BROKER) :",
        `   Adresse : ${broker.address}`,
        `   Seed    : ${broker.seed}`,
        "   Rôle    : Courtier Plateforme (BSA Platform Structurer)",
        "   Solde   : 1 000 XRP (initial)",
        "",
        "--------------------------------------------------------------------------------",
      ]
    : [];

  const header = [
    "================================================================================",
    "💎 AT1 XRPL — COMPTES DEVNET ACTIFS & CLÉS DE CONNEXION",
    "================================================================================",
    ...brokerSection,
    `👥  COMPTES UTILISATEURS CRÉÉS (HORS BASE SQLITE : ${accounts.length}) :`,
    "Ces comptes sont financés sur le Devnet XRPL mais ne sont PAS enregistrés",
    "dans SQLite (data/accounts.db).",
    "Ils seront enregistrés en base lors de leur première connexion et onboarding.",
    `Dernière mise à jour : ${new Date().toISOString()}`,
    "================================================================================",
    "",
  ].join("\n");

  const lines = accounts.map((acc, idx) => {
    return [
      `🔹 [${idx + 1}] ${acc.name} :`,
      `   Adresse : ${acc.address}`,
      `   Seed    : ${acc.seed}`,
      `   Solde   : ${acc.balanceXrp} XRP`,
      `   Créé le : ${acc.createdAt}`,
      "",
    ].join("\n");
  });

  const content = header + lines.join("\n");
  try {
    fs.writeFileSync(ROOT_TXT_FILE, content, "utf8");
  } catch (err) {
    console.warn("Could not write created_accounts.txt:", (err as Error).message);
  }
}

function persistAccounts(accounts: CreatedAccount[]): void {
  ensureDataDir();
  const json = JSON.stringify(accounts, null, 2);
  try {
    fs.writeFileSync(ROOT_JSON_FILE, json, "utf8");
    fs.writeFileSync(DATA_JSON_FILE, json, "utf8");
  } catch (err) {
    console.warn("Could not write created_accounts.json:", (err as Error).message);
  }
  writeTxtSummary(accounts);
}

/**
 * Wipes the created_accounts files completely.
 */
export function wipeCreatedAccounts(): void {
  persistAccounts([]);
}

/**
 * Reads the list of created accounts from disk.
 */
export function getCreatedAccounts(): CreatedAccount[] {
  try {
    if (fs.existsSync(ROOT_JSON_FILE)) {
      const raw = fs.readFileSync(ROOT_JSON_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn("Could not read created_accounts.json:", (err as Error).message);
  }
  return [];
}

/**
 * Appends a new created account to the file.
 */
export function addCreatedAccount(account: CreatedAccount): void {
  const current = getCreatedAccounts();
  const existingIdx = current.findIndex((a) => a.address === account.address);
  if (existingIdx >= 0) {
    current[existingIdx] = account;
  } else {
    current.push(account);
  }
  persistAccounts(current);
}

/**
 * Replaces the created accounts file with a fresh batch (wiping any previous accounts).
 */
export function setCreatedAccounts(accounts: CreatedAccount[]): void {
  persistAccounts(accounts);
}
