// Browser-safe, typed client for the chain shim. Person B imports this; nothing here signs or touches the ledger.
// Usage:  const chain = createChainClient(import.meta.env.VITE_CHAIN_URL ?? "http://localhost:8787")
import type { Bid, VaultState, Position, TxReceipt, WithdrawRequest, Blocked, DbAccount, AccountRole } from "./types.js";

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
      /** Returns the platform broker's classic address. */
      brokerAddress: () => call<{ address: string }>("/read/brokerAddress"),
      /** Returns all configured role addresses from the backend. */
      roles: () => call<Record<string, string>>("/read/roles"),
      /** Checks if the master key of an account is disabled. */
      isMasterDisabled: (address: string) => call<{ masterDisabled: boolean }>("/read/isMasterDisabled", [address]),
      /** List stored accounts from the database, optionally filtered by role. */
      listAccounts: (role?: AccountRole) => call<DbAccount[]>("/read/listAccounts", [role]),
      /** Get a stored account from the database by address. */
      getAccount: (address: string) => call<DbAccount | null>("/read/getAccount", [address]),
    },
    tx: {
      /** Register a wallet seed dynamically for the current session. */
      registerWallet: (seed: string) => call<{ address: string }>("/tx/registerWallet", [seed]),
      /** Create a new funded account on Devnet and save to DB. */
      createAccount: (params: { role?: AccountRole; name?: string; company?: string; firstName?: string; userRole?: string }) =>
        call<DbAccount>("/tx/createAccount", [params]),
      /** Instant 1-click creation of a random funded account on Devnet. */
      createRandomAccount: (name?: string) => call<DbAccount>("/tx/createRandomAccount", [name]),
      /** Update an account's role and profile details in DB. */
      updateAccount: (params: { address: string; role?: AccountRole; name?: string; company?: string; firstName?: string; userRole?: string; multisigActive?: number }) =>
        call<DbAccount>("/tx/updateAccount", [params]),
      /** Configure 2-of-2 Multisig on borrower account with master key disabled. */
      setupBorrowerMultisig: (borrowerAddress?: string) => call<TxReceipt>("/tx/setupBorrowerMultisig", [borrowerAddress]),
      /** Configure 2-of-2 Multisig on lender account with master key disabled. */
      setupLenderMultisig: (lenderAddress: string) => call<TxReceipt>("/tx/setupLenderMultisig", [lenderAddress]),
      /** Configure 2-of-2 Multisig on any account with master key disabled. */
      setupAccountMultisig: (accountAddress: string) => call<TxReceipt>("/tx/setupAccountMultisig", [accountAddress]),
      /** Deposit First-Loss cover capital into a LoanBroker. */
      depositCover: (loanBrokerId: string, amount: string) => call<TxReceipt>("/tx/depositCover", [loanBrokerId, amount]),
      /** Borrower posted a bid: creates vault + broker + cover. Keep vaultId and loanBrokerId on the bid. */
      createBond: (bid: Bid) => call<{ vaultId: string; loanBrokerId: string; receipts: TxReceipt[] }>("/tx/createBond", [bid]),

      /** Matched ask becomes a VaultDeposit. amount in XRP, e.g. "1000". */
      deposit: (lenderAddress: string, vaultId: string, amount: string) => call<TxReceipt>("/tx/deposit", [lenderAddress, vaultId, amount]),
      /** LoanSet with the multisig borrower; principal moves in this transaction. Keep loanId on the bid. */
      originate: (bid: Bid) => call<TxReceipt & { loanId?: string }>("/tx/originate", [bid]),
      /** One scheduled coupon, co-signed by the enforcer. Late coupons are flagged automatically. */
      payCoupon: (loanId: string, borrowerAddress: string) => call<TxReceipt | Blocked>("/tx/payCoupon", [loanId, borrowerAddress]),
      /** yield-only: redeem position.yieldShares. full: every share (fails with tecINSUFFICIENT_FUNDS or blocked by Enforcer while lent). */
      withdraw: (req: WithdrawRequest) => call<TxReceipt | Blocked>("/tx/withdraw", [req]),
      /** Before the call date: early close, refused by the enforcer. After: settles the remaining schedule. */
      finalRepayment: (loanId: string, borrowerAddress: string) => call<TxReceipt | Blocked>("/tx/finalRepayment", [loanId, borrowerAddress]),
      /** Broker write-down; accepted only once a payment is overdue. */
      impair: (loanId: string) => call<TxReceipt>("/tx/impair", [loanId]),
      unimpair: (loanId: string) => call<TxReceipt>("/tx/unimpair", [loanId]),
    },
  };
}
