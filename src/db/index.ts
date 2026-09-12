import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export interface DbAccount {
  address: string;
  role: "borrower" | "lender";
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

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    address TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK(role IN ('borrower', 'lender')),
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

export function listAccounts(role?: "borrower" | "lender"): DbAccount[] {
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

export function updateAccount(address: string, fields: Partial<DbAccount>): void {
  const existing = getAccount(address);
  if (!existing) throw new Error(`Account ${address} not found in database`);
  const updated: DbAccount = {
    ...existing,
    ...fields,
    multisigActive: fields.multisigActive !== undefined ? (fields.multisigActive ? 1 : 0) : existing.multisigActive,
  };
  saveAccount(updated);
}

export function deleteAccount(address: string): void {
  const stmt = db.prepare("DELETE FROM accounts WHERE address = ?");
  stmt.run(address);
}

export { db };
