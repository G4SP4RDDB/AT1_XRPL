// Browser-safe, typed client for the chain shim. Person B imports this; nothing here signs or touches the ledger.
// Usage:  const chain = createChainClient(import.meta.env.VITE_CHAIN_URL ?? "http://localhost:8787")
import type { Bid, VaultState, Position, TxReceipt, WithdrawRequest, Blocked } from "./types.js";

export type ChainClient = ReturnType<typeof createChainClient>;

export class ChainError extends Error {
  constructor(message: string, public readonly status: number, public readonly route: string) { super(message); }
}

export const isBlocked = (r: TxReceipt | Blocked): r is Blocked => "blocked" in r;
export const isSuccess = (r: TxReceipt | Blocked): r is TxReceipt => !isBlocked(r) && r.result === "tesSUCCESS";

export function createChainClient(baseUrl = "http://localhost:8787", fetchImpl: typeof fetch = fetch) {
  async function call<T>(route: string, args: unknown[] = []): Promise<T> {
    const res = await fetchImpl(`${baseUrl}${route}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ args }),
    });
    const body = await res.json().catch(() => ({ error: `non-JSON response from ${route}` }));
    if (!res.ok || (body && typeof body === "object" && "error" in body)) {
      throw new ChainError(String((body as { error?: string }).error ?? res.statusText), res.status, route);
    }
    return body as T;
  }

  return {
    read: {
      /** Live figures for one bond vault; `loan` present once originated. */
      vaultState: (vaultId: string) => call<VaultState>("/read/vaultState", [vaultId]),
      /** One depositor's shares, principal, value, accrued yield and redeemable yield shares. */
      position: (address: string, vaultId: string) => call<Position>("/read/position", [address, vaultId]),
      /** Every vault the platform broker owns, one per bond. */
      listVaults: () => call<VaultState[]>("/read/listVaults"),
    },
    tx: {
      /** Borrower posted a bid: creates vault + broker + cover. Keep vaultId and loanBrokerId on the bid. */
      createBond: (bid: Bid) => call<{ vaultId: string; loanBrokerId: string; receipts: TxReceipt[] }>("/tx/createBond", [bid]),
      /** Matched ask becomes a VaultDeposit. amount in XRP, e.g. "1000". */
      deposit: (lenderAddress: string, vaultId: string, amount: string) => call<TxReceipt>("/tx/deposit", [lenderAddress, vaultId, amount]),
      /** LoanSet with the multisig borrower; principal moves in this transaction. Keep loanId on the bid. */
      originate: (bid: Bid) => call<TxReceipt & { loanId?: string }>("/tx/originate", [bid]),
      /** One scheduled coupon, co-signed by the enforcer. Late coupons are flagged automatically. */
      payCoupon: (loanId: string, borrowerAddress: string) => call<TxReceipt | Blocked>("/tx/payCoupon", [loanId, borrowerAddress]),
      /** yield-only: redeem position.yieldShares. full: every share (fails with tecINSUFFICIENT_FUNDS while lent). */
      withdraw: (req: WithdrawRequest) => call<TxReceipt>("/tx/withdraw", [req]),
      /** Before the call date: early close, refused by the enforcer. After: settles the remaining schedule. */
      finalRepayment: (loanId: string, borrowerAddress: string) => call<TxReceipt | Blocked>("/tx/finalRepayment", [loanId, borrowerAddress]),
      /** Broker write-down; accepted only once a payment is overdue. */
      impair: (loanId: string) => call<TxReceipt>("/tx/impair", [loanId]),
      unimpair: (loanId: string) => call<TxReceipt>("/tx/unimpair", [loanId]),
    },
  };
}
