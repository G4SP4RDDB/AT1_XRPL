// Contract between /chain (Person A) and /frontend (Person B).
// Agreed together at F3, then edited only by Person A. Amounts are XRP as decimal strings unless noted.

export type Address = string;
export type IsoDate = string;

export type BidStatus = "open" | "matched" | "originated" | "repaid";

export interface Bid {
  id: string;
  borrowerAddress: Address;
  amount: string;        // XRP requested
  yieldRate: number;     // annual, percent, e.g. 8.5
  callDate: IsoDate;     // earliest full repayment
  status: BidStatus;
  vaultId?: string;
  loanBrokerId?: string;
  loanId?: string;
  borrowerName?: string;
  description?: string;
}

export interface Ask {
  id: string;
  lenderAddress: Address;
  amount: string;        // XRP offered
  indicated: boolean;    // purely indicative, nothing on-chain until matched
  matchedBidId?: string;
  lenderName?: string;
  targetYield?: number;
  status?: "pending" | "matched" | "deposited";
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
}

export type Blocked = { blocked: "before-call-date" | "wrong-amount" | "not-loan-pay"; reason: string };

export interface DbAccount {
  address: Address;
  role: "borrower" | "lender";
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
