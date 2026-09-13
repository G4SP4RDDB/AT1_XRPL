// Contract between /chain (Person A) and /frontend (Person B).
// Agreed together at F3, then edited only by Person A. Amounts are XRP as decimal strings unless noted.

export type Address = string;
export type IsoDate = string;

export type AskStatus = "open" | "matched" | "originated" | "repaid";

// The borrower's posted tranche: what they're asking to borrow, and on what terms. Conventionally
// an "ask" (the seller/issuer's price) — renamed from the original "Bid" naming, which had this
// backwards (see docs/bank-profiles-and-order-book.md and FEEDBACK_REPORT.md for the history).
export interface Ask {
  id: string;
  borrowerAddress: Address;
  amount: string;        // XRP requested
  yieldRate: number;     // annual, percent, e.g. 8.5 — the borrower's own posted/ceiling rate
  callDate: IsoDate;     // earliest full repayment
  status: AskStatus;
  vaultId?: string;
  loanBrokerId?: string;
  loanId?: string;
  borrowerName?: string;
  description?: string;
  expiresAt?: IsoDate;    // off-chain-only: bidding window closes at this time, no new bids after
}

export type LoanStatus = "none" | "active" | "impaired" | "defaulted" | "closed" | "repaid";

export interface LoanState {
  loanId: string;
  principalOutstanding: string;
  totalValueOutstanding: string;
  periodicPayment: string;
  nextPaymentDueDate: IsoDate;
  paymentRemaining: number;
  status: LoanStatus;
}

export interface VaultState {
  vaultId: string;
  asset: "XRP";
  assetsTotal: string;      // includes principal out on loan
  assetsAvailable: string;  // liquid, what withdrawals can draw on
  lossUnrealized: string;   // > 0 while the loan is impaired
  sharesTotal: string;
  pps: number;              // (assetsTotal - lossUnrealized) / sharesTotal
  callDate: IsoDate;
  loan?: LoanState;
  stub?: true;              // present while the chain layer returns fixtures
  bidId?: string;
  borrowerAddress?: Address;
  brokerAddress?: Address;
  liquidAssets?: string;
  loanPrincipal?: string;
  loanInterestRate?: number;
  loanStatus?: LoanStatus;
  firstLossCover?: string;
  isCallDateReached?: boolean;
  isLiquidityLocked?: boolean;
}

export interface Position {
  depositorAddress: Address;
  vaultId: string;
  shares: string;
  principalDeposited: string;
  currentValue: string;
  accruedYield: string;
  yieldShares: string;      // shares redeemable without touching principal
  stub?: true;
  accountAddress?: Address;
  sharesOwned?: string;
  yieldEquivalentShares?: string;
}

export type UserPosition = Position;

export interface WithdrawRequest {
  depositorAddress: Address;
  vaultId: string;
  mode: "yield-only" | "full";
}

export interface TxReceipt {
  hash: string;
  result: string;           // engine result, e.g. tesSUCCESS or a tec code
  explorerUrl: string;
  ledgerIndex?: number;
  stub?: true;
  /** Set on a VaultDeposit receipt: what the shim did about origination right after the deposit. */
  autoOrigination?: AutoOrigination;
}

export type AutoOrigination =
  | { originated: TxReceipt & { loanId?: string } }
  | { skipped: string };

export type Blocked = {
  blocked: "before-call-date" | "wrong-amount" | "not-loan-pay" | "unauthorized-principal-withdrawal" | "not-issuer" | "not-supported";
  reason: string;
};

// Off-chain only: links an address to a human-readable institution identity so the UI can
// show "Nordic Capital Bank" instead of a raw address. Never touches the ledger.
export interface BankProfile {
  address: Address;
  bankName: string;
  shortCode?: string;
  country?: string;
  logoEmoji?: string;
  rating?: string; // e.g. "AA-", freeform credit rating, off-chain, self-reported
  createdAt: IsoDate;
}

export type AccountRole = "borrower" | "lender" | "broker" | "unassigned";

export interface DbAccount {
  address: Address;
  role: AccountRole;
  name: string;
  seed: string;
  company?: string;
  firstName?: string;
  userRole?: string;
  operatorAddress?: string;
  operatorSeed?: string;
  multisigActive: number;
  createdAt: string;
}

export interface CreatedAccount {
  address: Address;
  seed: string;
  balanceXrp: number | string;
  name: string;
  createdAt: string;
}
