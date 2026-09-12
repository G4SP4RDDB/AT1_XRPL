// Ledger reads used by the read layer and the spikes.
import type { Client } from "xrpl";
import { dropsToXrp } from "xrpl";

export interface VaultInfo {
  vaultId: string;
  owner: string;
  account: string;
  assetsTotal: string;
  assetsAvailable: string;
  lossUnrealized: string;
  assetsMaximum: string;
  shareMptId: string;
  sharesOutstanding: string;
  pps: number;
  scale: number;
}

export async function vaultInfo(client: Client, vaultId: string): Promise<VaultInfo> {
  const r = await client.request({ command: "vault_info", vault_id: vaultId, ledger_index: "validated" } as any);
  const v = (r as any).result.vault;
  const total = Number(v.AssetsTotal ?? 0), loss = Number(v.LossUnrealized ?? 0), shares = Number(v.shares?.OutstandingAmount ?? 0);
  return {
    vaultId: v.index, owner: v.Owner, account: v.Account,
    assetsTotal: String(v.AssetsTotal ?? "0"), assetsAvailable: String(v.AssetsAvailable ?? "0"),
    lossUnrealized: String(v.LossUnrealized ?? "0"), assetsMaximum: String(v.AssetsMaximum ?? "0"),
    shareMptId: v.ShareMPTID, sharesOutstanding: String(v.shares?.OutstandingAmount ?? "0"),
    pps: shares > 0 ? (total - loss) / shares : 0, scale: v.Scale ?? 6,
  };
}

export async function ledgerEntry(client: Client, index: string): Promise<any> {
  const r = await client.request({ command: "ledger_entry", index, ledger_index: "validated" } as any);
  return (r as any).result.node;
}

/** Share (MPT) balance an account holds for a given issuance id. */
export async function shareBalance(client: Client, account: string, mptIssuanceId: string): Promise<string> {
  const r = await client.request({ command: "account_objects", account, type: "mptoken", ledger_index: "validated" } as any);
  const hit = ((r as any).result.account_objects as any[]).find((o) => o.MPTokenIssuanceID === mptIssuanceId);
  return hit ? String(hit.MPTAmount ?? "0") : "0";
}

export async function xrpBalance(client: Client, account: string): Promise<number> {
  const r = await client.request({ command: "account_info", account, ledger_index: "validated" });
  return Number(dropsToXrp(r.result.account_data.Balance));
}

export async function ledgerCloseTime(client: Client): Promise<number> {
  const r = await client.request({ command: "ledger", ledger_index: "validated" });
  return (r.result.ledger as any).close_time as number; // ripple epoch seconds
}
