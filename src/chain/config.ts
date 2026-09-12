// Network and demo constants for the custom hackathon devnet (Track 1, open-ended).
export const NETWORK = {
  wss: "wss://lending-hackathon.dev.ripplex.io:51233",
  rpc: "https://lending-hackathon.dev.ripplex.io:51234",
  faucet: "https://lending-hackathon-faucet.dev.ripplex.io/accounts",
  explorer: "https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233",
} as const;

export const REQUIRED_AMENDMENTS = ["SingleAssetVault", "LendingProtocol"] as const;

export const SECONDS_PER_YEAR = 31_536_000;

// Rates in XLS-66 are 1/10 basis point units: 100000 = 100 %, 10000 = 10 %, 1000 = 1 %.
// Interest is annualised, so a loan lasting minutes earns very little: with 1000 XRP at 100 % over
// 3 x 180 s the total interest is about 0.017 XRP (17 000 drops). Visible in drops, not in XRP.
export const DEMO_LOAN = {
  principalXrp: 1000,
  paymentTotal: 3,
  paymentIntervalSec: 180, // spec minimum 60
  gracePeriodSec: 120,     // spec: 60 <= grace <= interval
  interestRate: 100_000,   // 100 % annual, the maximum, so interest is at least visible in drops
  closeInterestRate: 1_000, // 1 % of principal outstanding charged on an early close
  closePaymentFeeXrp: 1,
  loanServiceFeeXrp: 0,
  overpaymentAllowed: false, // never set tfLoanOverpayment: the ledger then rejects overpayments itself
} as const;

export const DEMO_BROKER = {
  managementFeeRate: 1_000,   // 1 % of interest to the broker (max 10000)
  coverRateMinimum: 10_000,   // first-loss capital must cover 10 % of DebtTotal
  coverRateLiquidation: 10_000,
  coverDepositXrp: 150,       // > 10 % of (principal + interest)
  debtMaximumXrp: 0,          // 0 = unlimited
} as const;

// Vault cap. LoanSet fails with tecLIMIT_EXCEEDED if AssetsTotal >= AssetsMaximum or
// AssetsTotal + InterestDue > AssetsMaximum, so the cap must leave room for the interest the
// vault will book at origination. Cap = principal + interestDue + this margin (in drops).
export const VAULT_CAP_MARGIN_DROPS = 1_000;

export const ROLES = ["broker", "brokerEnforcer", "lender1", "lender2", "borrower"] as const;
export type Role = (typeof ROLES)[number];
