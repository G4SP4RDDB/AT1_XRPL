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
  const status = Number(loan.PaymentRemaining) === 0 ? "closed" : flags & 0x00010000 ? "defaulted" : flags & 0x00020000 ? "impaired" : "active";
  return {
    loanId: loan.index, principalOutstanding: xrp(loan.PrincipalOutstanding), totalValueOutstanding: xrp(loan.TotalValueOutstanding),
    periodicPayment: xrp(Math.ceil(Number(loan.PeriodicPayment))), nextPaymentDueDate: rippleToIso(Number(loan.NextPaymentDueDate)),
    paymentRemaining: Number(loan.PaymentRemaining), status,
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
  const callDate = loan && Number(loan.PaymentRemaining) > 0 ? rippleToIso(callDateRipple(loan)) : (data.c ?? "");
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

export async function positionOf(client: Client, address: string, vaultId: string): Promise<Position> {
  const v = await vaultInfo(client, vaultId);
  const shares = Number(await shareBalance(client, address, v.shareMptId));
  const { depositedDrops, withdrawnDrops } = await depositHistory(client, address, vaultId);
  const currentValueDrops = shares * v.pps;
  const principalShares = v.pps > 0 ? Math.max(0, depositedDrops - withdrawnDrops) / v.pps : 0;
  const yieldShares = Math.max(0, Math.floor(shares - principalShares));
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

export const read = {
  vaultState: async (vaultId: string) => vaultStateOf(await getClient(), vaultId),
  position: async (address: string, vaultId: string) => positionOf(await getClient(), address, vaultId),
  listVaults: async () => listVaultsOf(await getClient()),
  brokerAddress: async () => ({ address: loadAccounts().broker.classicAddress }),
};
