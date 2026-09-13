// Browser-safe, typed client for the chain shim. Person B imports this; nothing here signs or touches the ledger.
// Usage:  const chain = createChainClient(import.meta.env.VITE_CHAIN_URL ?? "http://localhost:8787")
import type { Bid, VaultState, Position, TxReceipt, WithdrawRequest, Blocked, DbAccount, AccountRole, CreatedAccount } from "./types.js";

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
      /** Get freshly created accounts recorded in created_accounts.json. */
      createdAccounts: () => call<CreatedAccount[]>("/read/createdAccounts"),
    },
    tx: {
      /** Wipe the created_accounts.json and created_accounts.txt files. */
      wipeCreatedAccounts: () => call<{ success: boolean }>("/tx/wipeCreatedAccounts"),
      /** Update an account's role and profile details in DB — the address must already be a real,
       *  independently-held account (connected via a real wallet), never one this backend minted. */
      updateAccount: (params: { address: string; role?: AccountRole; name?: string; company?: string; firstName?: string; userRole?: string; multisigActive?: number }) =>
        call<DbAccount>("/tx/updateAccount", [params]),
      /** Deposit First-Loss cover capital into a LoanBroker. */
      depositCover: (loanBrokerId: string, amount: string) => call<TxReceipt>("/tx/depositCover", [loanBrokerId, amount]),
      /** Borrower posted a bid: creates vault + broker + cover. Keep vaultId and loanBrokerId on the bid. */
      createBond: (bid: Bid) => call<{ vaultId: string; loanBrokerId: string; receipts: TxReceipt[] }>("/tx/createBond", [bid]),

      /** Prepare a VaultDeposit for the lender's own wallet to sign (amount in XRP, e.g. "1000") —
       *  submit the result with submitSigned() once signed. */
      prepareDeposit: (lenderAddress: string, vaultId: string, amount: string) => call<Record<string, unknown>>("/tx/prepareDeposit", [lenderAddress, vaultId, amount]),
      /** Submit any transaction already signed by an external, independent wallet. */
      submitSigned: (signedBlob: string) => call<TxReceipt>("/tx/submitSigned", [signedBlob]),
      /** LoanSet with the multisig borrower; principal moves in this transaction. Keep loanId on the bid. */
      originate: (bid: Bid) => call<TxReceipt & { loanId?: string }>("/tx/originate", [bid]),
      /** One scheduled coupon, co-signed by the enforcer. Late coupons are flagged automatically. Multisig-active accounts only. */
      payCoupon: (loanId: string, borrowerAddress: string) => call<TxReceipt | Blocked>("/tx/payCoupon", [loanId, borrowerAddress]),
      /** yield-only: redeem position.yieldShares. full: every share (fails with tecINSUFFICIENT_FUNDS or blocked by Enforcer while lent). Multisig-active accounts only. */
      withdraw: (req: WithdrawRequest) => call<TxReceipt | Blocked>("/tx/withdraw", [req]),
      /** Prepare a plain (non-multisig) VaultWithdraw for the depositor's own wallet to sign. */
      prepareWithdraw: (req: WithdrawRequest) => call<{ prepared: Record<string, unknown> } | Blocked>("/tx/prepareWithdraw", [req]),
      /** Before the call date: early close, refused by the enforcer. After: settles the remaining schedule. */
      finalRepayment: (loanId: string, borrowerAddress: string) => call<TxReceipt | Blocked>("/tx/finalRepayment", [loanId, borrowerAddress]),
      /** Broker write-down; accepted only once a payment is overdue. */
      impair: (loanId: string) => call<TxReceipt>("/tx/impair", [loanId]),
      unimpair: (loanId: string) => call<TxReceipt>("/tx/unimpair", [loanId]),
      /** Prepare the two transactions (SignerListSet, AccountSet asfDisableMaster) that convert an
       *  account to 2-of-2 multisig — for the account owner's own wallet to sign, in order. */
      prepareAccountMultisigSetup: (accountAddress: string) =>
        call<{ signerListSet: Record<string, unknown>; disableMaster: Record<string, unknown> }>("/tx/prepareAccountMultisigSetup", [accountAddress]),
      /** Submit both signed halves of the multisig setup, in order. */
      submitAccountMultisigSetup: (accountAddress: string, signerListSetBlob: string, disableMasterBlob: string) =>
        call<TxReceipt>("/tx/submitAccountMultisigSetup", [accountAddress, signerListSetBlob, disableMasterBlob]),
    },
  };
}
