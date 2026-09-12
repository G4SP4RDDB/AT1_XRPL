// Real implementations behind read.*: vault state with its loan, a depositor's position, the broker's vaults.
// Stateless: bid terms live in the vault's Data field, the loan is found through the borrower's owned objects.
import { dropsToXrp, type Client } from "xrpl";
import type { VaultState, Position, LoanState } from "../../shared/types.js";
import { getClient } from "./client.js";
import { loadAccounts } from "./accounts.js";
import { vaultInfo, ledgerEntry, shareBalance, type VaultInfo } from "./read.js";
import { rippleToIso } from "./loanMath.js";
import { callDateRipple } from "./enforcer/index.js";

/** Drops (string, number, or absent, since the ledger omits zero-valued fields) to an XRP decimal string. */
export const xrp = (drops: number | string | undefined | null) => {
  const n = Math.round(Number(drops ?? 0));
  return String(dropsToXrp(String(Number.isFinite(n) ? n : 0)));
};

async function ownedObjects(client: Client, account: string, entryType: string): Promise<any[]> {
  const out: any[] = [];
  let marker: unknown;
  do {
    const r: any = await client.request({ command: "account_objects", account, ledger_index: "validated", limit: 400, ...(marker ? { marker } : {}) } as any);
    out.push(...r.result.account_objects.filter((o: any) => o.LedgerEntryType === entryType));
    marker = r.result.marker;
  } while (marker);
  return out;
}

async function vaultData(client: Client, v: VaultInfo): Promise<{ id?: string; b?: string; a?: string; y?: number; c?: string }> {
  const r: any = await client.request({ command: "ledger_entry", index: v.vaultId, ledger_index: "validated" } as any);
  const hex = r.result.node?.Data;
  if (!hex) return {};
  try { return JSON.parse(Buffer.from(hex, "hex").toString("utf8")); } catch { return {}; }
}

export function loanState(loan: any): LoanState {
  const flags = Number(loan.Flags ?? 0);
  // Like every other zero-valued field on this ledger, a closed loan's `PaymentRemaining` (0) is omitted from the
  // entry entirely rather than serialized as "0" (confirmed against the devnet: a Loan read back right after its
  // closing LoanPay has no PaymentRemaining key at all). `Number(undefined) === 0` is false, so this used to read
  // a genuinely closed loan back as "active" and never flip payment-remaining to 0. Caught by the
  // INTEGRATION_CLOSE=1 settlement integration test.
  const paymentRemaining = Number(loan.PaymentRemaining ?? 0);
  const status = paymentRemaining === 0 ? "closed" : flags & 0x00010000 ? "defaulted" : flags & 0x00020000 ? "impaired" : "active";
  return {
    loanId: loan.index, principalOutstanding: xrp(loan.PrincipalOutstanding), totalValueOutstanding: xrp(loan.TotalValueOutstanding),
    periodicPayment: xrp(Math.ceil(Number(loan.PeriodicPayment))), nextPaymentDueDate: rippleToIso(Number(loan.NextPaymentDueDate)),
    paymentRemaining, status,
  };
}

async function findLoan(client: Client, borrower: string | undefined, loanBrokerId: string | undefined): Promise<any | undefined> {
  if (!borrower || !loanBrokerId) return undefined;
  const loans = await ownedObjects(client, borrower, "Loan");
  return loans.filter((l) => l.LoanBrokerID === loanBrokerId).sort((a, b) => Number(b.LoanSequence) - Number(a.LoanSequence))[0];
}

async function brokerFor(client: Client, vaultId: string): Promise<any | undefined> {
  const brokers = await ownedObjects(client, loadAccounts().broker.classicAddress, "LoanBroker");
  return brokers.find((b) => b.VaultID === vaultId);
}

export async function vaultStateOf(client: Client, vaultId: string): Promise<VaultState> {
  const v = await vaultInfo(client, vaultId);
  const data = await vaultData(client, v);
  const lb = await brokerFor(client, vaultId);
  const loan = await findLoan(client, data.b, lb?.index);
  // A closed loan omits PaymentRemaining rather than serializing it as 0 (see loanState above); `?? 0` keeps
  // callDate falling back to the vault's Data-stored bid call date once the loan is gone, instead of NaN > 0.
  const callDate = loan && Number(loan.PaymentRemaining ?? 0) > 0 ? rippleToIso(callDateRipple(loan)) : (data.c ?? "");
  const liquidAssets = xrp(v.assetsAvailable);
  const principalOutstanding = loan ? xrp(loan.PrincipalOutstanding) : "0";
  const isLiquidityLocked = Number(principalOutstanding) > 0 && Number(liquidAssets) < Number(principalOutstanding);
  const isCallDateReached = callDate ? new Date(callDate).getTime() <= Date.now() : false;
  return {
    vaultId,
    asset: "XRP",
    assetsTotal: xrp(v.assetsTotal),
    assetsAvailable: liquidAssets,
    lossUnrealized: xrp(v.lossUnrealized),
    sharesTotal: v.sharesOutstanding,
    pps: v.pps,
    callDate,
    loan: loan ? loanState(loan) : undefined,
    bidId: data.id,
    borrowerAddress: data.b,
    brokerAddress: lb?.Owner ?? loadAccounts().broker.classicAddress,
    liquidAssets,
    loanPrincipal: data.a ?? (loan ? principalOutstanding : "0"),
    loanInterestRate: data.y,
    loanStatus: loan ? loanState(loan).status : "none",
    firstLossCover: lb?.CoverAvailable ? xrp(lb.CoverAvailable) : "0",
    isCallDateReached,
    isLiquidityLocked,
  };
}

/** Principal deposited and assets withdrawn by one account on one vault, from its own transaction history. */
async function depositHistory(client: Client, account: string, vaultId: string): Promise<{ depositedDrops: number; withdrawnDrops: number }> {
  let depositedDrops = 0, withdrawnDrops = 0, marker: unknown;
  do {
    const r: any = await client.request({ command: "account_tx", account, ledger_index_min: -1, ledger_index_max: -1, limit: 200, ...(marker ? { marker } : {}) } as any);
    for (const t of r.result.transactions) {
      const tx = t.tx_json ?? t.tx;
      if (!tx || tx.VaultID !== vaultId || t.meta?.TransactionResult !== "tesSUCCESS") continue;
      if (tx.TransactionType === "VaultDeposit" && typeof tx.Amount === "string") depositedDrops += Number(tx.Amount);
      if (tx.TransactionType === "VaultWithdraw") {
        // XRP received = balance delta of the account minus the fee it paid
        const node = (t.meta.AffectedNodes as any[]).map((n) => n.ModifiedNode).find((m) => m?.LedgerEntryType === "AccountRoot" && m.FinalFields?.Account === account);
        if (node) withdrawnDrops += Number(node.FinalFields.Balance) - Number(node.PreviousFields?.Balance ?? node.FinalFields.Balance) + Number(tx.Fee ?? 0);
      }
    }
    marker = r.result.marker;
  } while (marker);
  return { depositedDrops, withdrawnDrops };
}

/**
 * Splits a depositor's current shares into a principal share count and a yield share count, at the vault's
 * current PPS. Pure so it's unit-testable without a ledger connection (see tests/readLayer.test.ts).
 *
 * Principal basis in today's shares is `depositedDrops / pps` alone, never net of withdrawnDrops. Every
 * withdrawal this app performs mid-loan is yield-only by construction, so it burns shares out of the yield
 * pool, not the principal one; `shares` (the live MPT balance passed in) already reflects that burn. Netting
 * withdrawnDrops out of the basis here double-counted it: right after redeeming Y yield shares, principalShares
 * dropped by the same Y worth of drops that shares had just lost, so yieldShares (= shares - principalShares)
 * came back unchanged instead of falling to ~0. Caught by the yield-only-withdrawal integration test.
 */
export function splitShares(shares: number, depositedDrops: number, pps: number): { principalShares: number; yieldShares: number } {
  const principalShares = pps > 0 ? depositedDrops / pps : 0;
  return { principalShares, yieldShares: Math.max(0, Math.floor(shares - principalShares)) };
}

export async function positionOf(client: Client, address: string, vaultId: string): Promise<Position> {
  const v = await vaultInfo(client, vaultId);
  const shares = Number(await shareBalance(client, address, v.shareMptId));
  const { depositedDrops, withdrawnDrops } = await depositHistory(client, address, vaultId);
  const currentValueDrops = shares * v.pps;
  const { yieldShares } = splitShares(shares, depositedDrops, v.pps);
  return {
    depositorAddress: address, vaultId, shares: String(shares), principalDeposited: xrp(depositedDrops),
    currentValue: xrp(currentValueDrops), accruedYield: xrp(currentValueDrops + withdrawnDrops - depositedDrops), yieldShares: String(yieldShares),
  };
}

export async function listVaultsOf(client: Client): Promise<VaultState[]> {
  const vaults = await ownedObjects(client, loadAccounts().broker.classicAddress, "Vault");
  const out: VaultState[] = [];
  for (const v of vaults) out.push(await vaultStateOf(client, v.index));
  return out;
}

import { listAccounts, getAccount, type DbAccount } from "../db/index.js";

/** Redact private seeds so keys are NEVER transmitted over HTTP / network */
function sanitizeAccount(acc: DbAccount): DbAccount {
  return {
    ...acc,
    seed: "",
    operatorSeed: undefined,
  };
}

export const read = {
  vaultState: async (vaultId: string) => vaultStateOf(await getClient(), vaultId),
  position: async (address: string, vaultId: string) => positionOf(await getClient(), address, vaultId),
  listVaults: async () => listVaultsOf(await getClient()),
  brokerAddress: async () => ({ address: loadAccounts().broker.classicAddress }),
  roles: async () => Object.fromEntries(Object.entries(loadAccounts()).map(([k, v]) => [k, v.classicAddress])),
  listAccounts: async (role?: "borrower" | "lender" | "unassigned") => listAccounts(role).map(sanitizeAccount),
  getAccount: async (address: string) => {
    const acc = getAccount(address);
    return acc ? sanitizeAccount(acc) : null;
  },
  isMasterDisabled: async (address: string) => {
    const client = await getClient();
    try {
      const ai: any = await client.request({ command: "account_info", account: address, ledger_index: "validated" } as any);
      return { masterDisabled: ((ai.result.account_data.Flags ?? 0) & 0x00100000) !== 0 };
    } catch {
      return { masterDisabled: false };
    }
  },
};
