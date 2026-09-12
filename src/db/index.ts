import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { Wallet } from "xrpl";

export type AccountRole = "borrower" | "lender" | "broker" | "unassigned";

export interface DbAccount {
  address: string;
  role: AccountRole;
  name: string;
  seed: string;
  company?: string;
  firstName?: string;
  userRole?: string;
  operatorAddress?: string;
  operatorSeed?: string;
  multisigActive: number; // 0 or 1
  createdAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "accounts.db");
const db = new Database(DB_PATH);

// Check if migration is needed to support 'broker' role
try {
  const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='accounts'").get() as { sql: string } | undefined;
  if (tableSql?.sql && !tableSql.sql.includes("'broker'")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS accounts_new (
        address TEXT PRIMARY KEY,
        role TEXT NOT NULL DEFAULT 'unassigned' CHECK(role IN ('borrower', 'lender', 'broker', 'unassigned')),
        name TEXT NOT NULL,
        seed TEXT NOT NULL,
        company TEXT,
        firstName TEXT,
        userRole TEXT,
        operatorAddress TEXT,
        operatorSeed TEXT,
        multisigActive INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL
      );
      INSERT INTO accounts_new SELECT * FROM accounts;
      DROP TABLE accounts;
      ALTER TABLE accounts_new RENAME TO accounts;
      CREATE INDEX IF NOT EXISTS idx_accounts_role ON accounts(role);
    `);
  }
} catch (err) {
  // If migration fails or table doesn't exist yet, fallback to CREATE TABLE below
}

// Initialize schema if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    address TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'unassigned' CHECK(role IN ('borrower', 'lender', 'broker', 'unassigned')),
    name TEXT NOT NULL,
    seed TEXT NOT NULL,
    company TEXT,
    firstName TEXT,
    userRole TEXT,
    operatorAddress TEXT,
    operatorSeed TEXT,
    multisigActive INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_accounts_role ON accounts(role);
`);

export function listAccounts(role?: AccountRole): DbAccount[] {
  if (role) {
    const stmt = db.prepare("SELECT * FROM accounts WHERE role = ? ORDER BY createdAt ASC");
    return stmt.all(role) as DbAccount[];
  }
  const stmt = db.prepare("SELECT * FROM accounts ORDER BY createdAt ASC");
  return stmt.all() as DbAccount[];
}

export function getAccount(address: string): DbAccount | null {
  const stmt = db.prepare("SELECT * FROM accounts WHERE address = ?");
  const row = stmt.get(address);

  return (row as DbAccount) ?? null;
}

export function saveAccount(account: DbAccount): void {
  const stmt = db.prepare(`
    INSERT INTO accounts (address, role, name, seed, company, firstName, userRole, operatorAddress, operatorSeed, multisigActive, createdAt)
    VALUES (@address, @role, @name, @seed, @company, @firstName, @userRole, @operatorAddress, @operatorSeed, @multisigActive, @createdAt)
    ON CONFLICT(address) DO UPDATE SET
      role = excluded.role,
      name = excluded.name,
      seed = excluded.seed,
      company = coalesce(excluded.company, accounts.company),
      firstName = coalesce(excluded.firstName, accounts.firstName),
      userRole = coalesce(excluded.userRole, accounts.userRole),
      operatorAddress = coalesce(excluded.operatorAddress, accounts.operatorAddress),
      operatorSeed = coalesce(excluded.operatorSeed, accounts.operatorSeed),
      multisigActive = excluded.multisigActive
  `);
  stmt.run({
    address: account.address,
    role: account.role,
    name: account.name,
    seed: account.seed,
    company: account.company ?? null,
    firstName: account.firstName ?? null,
    userRole: account.userRole ?? null,
    operatorAddress: account.operatorAddress ?? null,
    operatorSeed: account.operatorSeed ?? null,
    multisigActive: account.multisigActive ?? 0,
    createdAt: account.createdAt,
  });
}

export function updateAccount(address: string, fields: Partial<DbAccount>): DbAccount {
  const existing = getAccount(address);
  if (!existing) throw new Error(`Account ${address} not found in database`);
  
  let operatorAddress = fields.operatorAddress ?? existing.operatorAddress;
  let operatorSeed = fields.operatorSeed ?? existing.operatorSeed;

  // Auto-generate operator key if promoted to borrower or lender and lacks one
  if ((fields.role === "borrower" || fields.role === "lender") && !operatorAddress) {
    const opWallet = Wallet.generate();
    operatorAddress = opWallet.classicAddress;
    operatorSeed = opWallet.seed;
  }

  const updated: DbAccount = {
    ...existing,
    ...fields,
    operatorAddress,
    operatorSeed,
    multisigActive: fields.multisigActive !== undefined ? (fields.multisigActive ? 1 : 0) : existing.multisigActive,
  };
  saveAccount(updated);
  return updated;
}

export function deleteAccount(address: string): void {
  const stmt = db.prepare("DELETE FROM accounts WHERE address = ?");
  stmt.run(address);
}

/** Seed platform broker into SQLite DB if available in .env */
export function seedBrokerIfMissing(): void {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, "utf8");
    const m = content.match(/BROKER_SEED=([^\s]+)/);
    if (m && m[1]) {
      const wallet = Wallet.fromSeed(m[1].trim());
      const existing = getAccount(wallet.classicAddress);
      if (!existing) {
        saveAccount({
          address: wallet.classicAddress,
          role: "broker",
          name: "Courtier Plateforme (Broker)",
          seed: wallet.seed!,
          company: "BSA Platform Structurer",
          firstName: "Courtier Principal",
          userRole: "Structurateur & Risque",
          multisigActive: 0,
          createdAt: new Date().toISOString(),
        });
      } else if (existing.role !== "broker") {
        updateAccount(wallet.classicAddress, { role: "broker" });
      }
    }
  } catch (err) {
    // Ignore error
  }
}
seedBrokerIfMissing();

export { db };

