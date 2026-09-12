// Off-chain bank profile registry: links an XRPL address to a human-readable institution
// identity (bank name, short code, country, logo emoji). Plain JSON file — traffic is a
// handful of writes for a hackathon demo, no need for a real database engine.
import fs from "node:fs";
import path from "node:path";
import type { Address, BankProfile } from "../../shared/types.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "bank-profiles.json");

// Addresses must match ROLE_ACCOUNTS in frontend/src/lib/wallet.tsx (same convention as the
// seeds backing them: kept in sync by hand, not imported, since frontend and chain layer
// don't share a runtime module boundary here).
// Pre-seeded so the four demo role accounts already read as institutions without live
// onboarding; a freshly WalletConnect-ed address still goes through the onboarding modal.
const SEED_PROFILES: BankProfile[] = [
  { address: "rsnFbojcDMuFmC7f3Ws7PdsvzSuA71RTgT", bankName: "Nordic Capital Bank", shortCode: "NCB", country: "Sweden", logoEmoji: "🏛️", createdAt: new Date(0).toISOString() },
  { address: "rD8F37f4XEpNMfCmSUDerZiSBSG8rD1QzZ", bankName: "Helios Pension Fund", shortCode: "HPF", country: "Netherlands", logoEmoji: "☀️", createdAt: new Date(0).toISOString() },
  { address: "rsn5ZUPZWQmtqDfDCnBrGf3bdkJNQCkDcW", bankName: "Meridian Asset Management", shortCode: "MAM", country: "Luxembourg", logoEmoji: "🧭", createdAt: new Date(0).toISOString() },
  { address: "r4r59gviPCnToSNThhHk9qetUwfNc7Rt2N", bankName: "AT1 Structuring Desk", shortCode: "AT1", country: "Ireland", logoEmoji: "🛡️", createdAt: new Date(0).toISOString() },
];

function readStore(): Record<Address, BankProfile> {
  if (!fs.existsSync(STORE_PATH)) {
    const seeded = Object.fromEntries(SEED_PROFILES.map((p) => [p.address, p]));
    writeStore(seeded);
    return seeded;
  }
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeStore(data: Record<Address, BankProfile>): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2) + "\n");
}

export async function get(address: Address): Promise<BankProfile | null> {
  if (!address) return null;
  return readStore()[address] ?? null;
}

export async function list(): Promise<BankProfile[]> {
  return Object.values(readStore());
}

export interface SetBankProfileInput {
  address: Address;
  bankName: string;
  shortCode?: string;
  country?: string;
  logoEmoji?: string;
}

export async function set(input: SetBankProfileInput): Promise<BankProfile> {
  if (!input?.address) throw new Error("address is required");
  if (!input?.bankName?.trim()) throw new Error("bankName is required");

  const store = readStore();
  const existing = store[input.address];
  const profile: BankProfile = {
    address: input.address,
    bankName: input.bankName.trim(),
    shortCode: input.shortCode?.trim() || undefined,
    country: input.country?.trim() || undefined,
    logoEmoji: input.logoEmoji?.trim() || undefined,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  store[input.address] = profile;
  writeStore(store);
  return profile;
}
