

## RIPPLE · XRPL
## XLS65  XLS66
## HACKATHON 2026 · XRPL LENDING PROTOCOL
Build Lending Apps on
the XRP Ledger.
Single Asset Vaults XLS65 + Lending Protocol XLS66. Native
primitives, no smart contracts.
## NATIVE ONCHAIN PRIMITIVESXRPL LENDING PROTOCOL · HACKATHON

## SECTION 1
Lending as a
## Financial Activity.
## XRPL LENDING PROTOCOL · HACKATHON

## LENDING AS A FINANCIAL ACTIVITY03 · 21
## WHAT IS LENDING
The tri-party model
Someone has idle capital. Someone needs it. A third party manages the risk.
## 01 · LENDER
Idle capital seeking return
Has assets (cash, tokens, stablecoins)
sitting unused. Wants yield. Deposits
into a pool or directly lends to a
borrower.
## 02 · INTERMEDIARY
Risk management and matching
Connects lenders and borrowers.
Underwrites credit risk, sets loan terms,
collects fees, and absorbs first losses if
things go wrong.
## 03 · BORROWER
Capital demand
Needs capital for a specific purpose:
fund a payment corridor, finance
inventory, bridge a settlement cycle.
Pays interest for access to that capital.
Interest is the price of using someone else's money. The intermediary earns a spread for managing risk.
## XRPL LENDING PROTOCOL · HACKATHON

## LENDING AS A FINANCIAL ACTIVITY
## 04 · 21
## WHY ONCHAIN
The case for on-chain credit
Traditional lending is slow, opaque, and expensive. On-chain makes it composable.
Transparency (all terms and repayments on-ledger), composability (vault shares usable in other protocols), and auditability 13 years of ledger history)
complete the case.
## 01 · HYBRID BY DESIGN
Underwriting and collateral stay off-chain.
Only asset pooling and financing flows run on-ledger. FIs keep
existing credit processes intact and automate what gains most from
being on-chain. Collateral sits with a custodian, never exposed to
smart contract risk.
## 02 · RISK ISOLATION PER VAULT
One protocol, many vaults.
One protocol supports multiple vaults, each isolated by asset, lender or
borrower. Stables / XRP can sit in a dedicated vault with no commingling,
independently permissioned with whitelisted depositors and KYC’d
borrowers.
## 03 · FIXED TERM, FIXED RATE
Predictable revenue, clean accounting.
Interest is fixed at origination, not variable as in DeFi. Institutions can
forecast revenue with certainty and report yield clearly to auditors
and regulators under IFRS and GAAP.
## 04 · REAL IDENTITIES, NOT PSEUDONYMS
Known counterparties, not anonymous wallets.
On-chain collateral is replaced by real businesses underwritten in
the real world. Borrowers and lenders are KYC’d, with legal
agreements enforced off-chain.
## 05 · CAPITAL AGGREGATION AT SCALE
Pool many small deposits into institutional-size loan
Set up a many-to-one vaults where retail holders around the world can deploy capital. Vault acst a sa liquidity pool which can be
tapped into to meet institutional size

## SECTION 2
XRPL Lending
## Protocol
## Overview.
## XRPL LENDING PROTOCOL · HACKATHON

## XRPL LENDING PROTOCOL07 · 21
## TWO PRIMITIVES
SAV + Lending Protocol = end-to-end lending
Two native primitives. One system.
## XLS65
## Single Asset Vault
Aggregates assets from multiple depositors into a single pool. Issues
yield-bearing shares MPTs that represent each depositor's pro-rata
ownership. Supports XRP, IOUs, and MPTs as vault assets.
Think of it as: the capital pool.
VaultDepositVaultWithdrawVaultSetVaultClawback
## XLS66
## Lending Protocol
Distributes vault liquidity as fixed-term loans. Manages loan lifecycle:
origination, repayment, default. Loan Broker intermediary handles fees,
first-loss capital, and debt tracking.
Think of it as: the loan engine.
LoanBrokerSetLoanSetLoanPayLoanManage
Not a smart contract you deploy. A native protocol on the ledger. Configure and use it via transaction types, accessible through JS/Go SDKs and APIs.
## XRPL LENDING PROTOCOL · HACKATHON

## XRPL LENDING PROTOCOL07 · 21
## TWO PRIMITIVES
SAV + Lending Protocol = end-to-end lending
Two native primitives. One system.
## XRPL LENDING PROTOCOL · HACKATHON
## +=
→ Single Asset Vault (SAV)
→ Lending Protocol (LP)
## SAV
## LP
E2E Lending Protocol
Pool manager: a
loan manager who
oversees lending &
borrowing,
servicing, fees etc

## XRPL LENDING PROTOCOL08 · 21
## THE ACTORS
Four roles in the system
XRPL handles everything below the application layer. You build the interface.
## 1
## Lender
Deposits assets into vault.
Receives yield-bearing shares
MPT. Can withdraw at any
time (open-ended) or at
maturity (closed-ended).
## SUPPLIES CAPITAL
## 2
## Loan Broker
Creates vault and lending
protocol. Sets fees, interest
rates, debt caps. Deposits
first-loss capital. Approves
borrowers (off-chain). Manages
loan lifecycle.
## MANAGES RISK
## 3
## Borrower
Co-signs loan with broker.
Receives principal from vault.
Repays on schedule.
Underwrites performed
off-chain. Collateral held
off-protocol.
## DEMANDS CAPITAL
## 4
## Your Application
The UI that makes it human. LP
dashboard, loan request forms,
admin panels. KYC/compliance
integration. Collateral tracking
(off-chain). Built on XRPL APIs
and SDKs.
## YOU BUILD THIS
## XRPL LENDING PROTOCOL · HACKATHON

## XRPL LENDING PROTOCOL09 · 21
## XRPL VS EVM
XRPL-way Of Building
XRPL is buying a suit off the rack which you modify.
## XRPL
Buying a suit off the rack and tailoring the fit (shorten
sleeves, tighten waist). You configure and deploy —
it's your SAV & LP.
## EVM
Buying fabric and a sewing machine, then stitching
the entire suit yourself. Full creative control, but every
ripped seam is yours to fix.
## XRPL LENDING PROTOCOL · HACKATHON

## XRPL LENDING PROTOCOL10 · 21
## TWO FLAVORS
Open-ended and closed-ended vaults
Same primitive, two modes. The difference is when capital moves.
## OPENENDED
Continuous liquidity.
Deposits and withdrawals at any time. Share price adjusts dynamically as
interest accrues. Capital recycles continuously into new loans.
## Entry / Exit
Any time
PPS movement
Continuous, as interest accrues
Loan recycling
Yes, capital re-deployed on repayment
Best for
Revolving credit, PayFi, yield products
## CLOSEDENDED
Fixed lifecycle.
Three phases: Subscription, Investment, Redemption. No mid-term entry or
exit. Interest injected via tfVaultDonation (raises PPS without minting shares).
Entry / ExitSubscription and redemption windows only
PPS movementAt interest injection events
Loan recyclingNo, fixed-term deployment
Best forBonds, credit funds, structured products
## XRPL LENDING PROTOCOL · HACKATHON

## SECTION 3
Open-Ended
## Vaults. Use Cases.
## XRPL LENDING PROTOCOL · HACKATHON

## OPENENDED VAULTS12 · 21
## HOW IT WORKS
Continuous deposit and withdrawal
Deposit anytime. Earn yield. Withdraw anytime. The vault is always open.
## 1
## Deposit
Lender sends assets to vault.
Shares minted proportionally.
PPS at time of entry determines
share count.
VaultDeposit
## 2
## Deploy
Broker originates loans from
vault liquidity. Borrower
co-signs via LoanSet. Principal
transferred on-chain.
LoanSet
## 3
## Earn
Borrower repays principal +
interest. Fees split to broker.
Vault assets increase, PPS
rises.
LoanPay
## 4
## Withdraw
Lender burns shares. Receives
assets at current PPS. More out
than in (if yield accrued).
VaultWithdraw
## KEY MECHANICS
→ PPS  AssetsTotal / SharesTotal→ Withdrawals always permitted (no lock)
→ FLC absorbs first losses on default
## XRPL LENDING PROTOCOL · HACKATHON

## OPENENDED · USE CASE 113 · 21
## PAYFI
Cross-border payment financing
Short-term RLUSD loans to fintechs. Yield from real payment demand.
## 1
LPs deposit RLUSD
Stablecoin holders deposit into vault via app UI.
Receive shares representing their claim on the
pool.
## SUPPLY SIDE
## 2
Fintech borrows
Payment company needs 3 to 30 day RLUSD to
settle cross-border transactions. Broker
underwrites off-chain, originates loan on-chain.
## DEMAND SIDE
## 3
Repay and recycle
Fintech repays when fiat settlement arrives.
Capital returns to vault, ready for the next loan.
LPs earn continuous yield.
## YIELD ENGINE
## WHY THIS WORKS ON XRPL
→ Near-zero fees: recycling capital 30x/month is economical→ 35s settlement: fintechs get funds immediately
→ RLUSD native: no bridging, no wrapping, no slippage→ Permissioned access: KYC gating via Credentials
## XRPL LENDING PROTOCOL · HACKATHON

## OPENENDED · USE CASE 214 · 21
## XRP YIELD
XRP yield for wallets and exchanges
Users deposit XRP and earn. You build the front-end.
## 1
User holds XRP
XRP sits idle in a CEX or self-custody wallet. User
wants yield but does not want to offramp or
manage DeFi positions manually.
## THE PROBLEM
## 2
App offers "staking"
Your app deposits user XRP into a vault.
Institutional borrower (prime broker, market
maker) borrows XRP and pays interest.
Open-ended: user can exit freely.
## YOUR PRODUCT
## 3
Yield flows back
Borrower repays interest to vault. PPS rises. User
sees yield accruing in their wallet. No bridging,
no wrapping. XRP stays on XRPL mainnet.
## THE OUTCOME
## WHAT YOU BUILD
→ LP dashboard: deposit, track yield, withdraw→ KYC/compliance: whitelist lenders and borrowers
→ Collateral tracking: off-chain, linked via URI metadata→ Admin panel: loan approval, monitoring, fee config
## XRPL LENDING PROTOCOL · HACKATHON

## SECTION 4
Closed-Ended
## Vaults. Use Cases.
## XRPL LENDING PROTOCOL · HACKATHON

## CLOSEDENDED VAULTS17 · 21
## HOW IT WORKS
Three-phase lifecycle
Subscribe. Invest. Redeem. No mid-term entry or exit. Think of it as a bond.
## 1
## Subscription
Vault opens for deposits. LPs send assets,
receive shares. Broker sets the subscription
window (e.g., 30 days). Once closed, no new
deposits accepted.
## CAPITAL RAISING
## 2
## Investment
Broker deploys capital into fixed-term loans.
Interest injected via tfVaultDonation. PPS
rises without minting new shares. No
withdrawals during this phase.
## CAPITAL AT WORK
## 3
## Redemption
Loans mature and repay. Vault reopens for
withdrawals. LPs redeem shares at final PPS.
Principal + earned yield returned.
## CAPITAL RETURNED
## XRPL LENDING PROTOCOL · HACKATHON

## CLOSEDENDED · USE CASE 219 · 21
## TOKENIZED BOND
Tokenized bond issuance
Map a bond's lifecycle directly onto a vault.
## BOND CONCEPTVAULT EQUIVALENTMECHANISM
Bond offering periodSubscription window
Vault open for VaultDeposit; shares minted to investors
Bond tenorInvestment period
Vault closed; capital deployed via LoanSet; deposits blocked
Coupon paymentInterest injection
Broker calls VaultDeposit with tfVaultDonation flag; PPS rises
Bond maturity / principal returnRedemption window
Loans repay; vault reopens for VaultWithdraw
Bond tokenVault shares MPT
Transferable (if configured); represent claim on principal + yield
Vault shares are the bond tokens. Issuers can configure transferability, permissioned access, and non-transferable (hold-to-maturity) modes.
## XRPL LENDING PROTOCOL · HACKATHON

## CLOSEDENDED · USE CASE 320 · 21
## SAVINGS PRODUCT
Structured savings product
90-day savings vault. Predictable return.
## 1
User deposits
Neobank or fintech app offers a "90-day
savings product." User deposits RLUSD
during the subscription window. No
decisions needed until maturity.
## SIMPLE UX
## 2
App deploys capital
The fintech (as loan broker) deploys capital
into diversified short-duration loans. Multiple
borrowers, concentration limits, FLC buffer.
## DIVERSIFIED RISK
## 3
User redeems
At maturity, all loans repay. User redeems
shares at final PPS. Principal + yield
returned. App can offer next cycle
automatically.
## PREDICTABLE RETURN
## WHY CLOSEDENDED FOR RETAIL
→ No mid-term decisions: deposit, wait, collect→ Predictable: term and expected yield known at entry
→ Simpler compliance: fixed investor set, known duration→ Composable: next cycle vault can auto-roll capital
## XRPL LENDING PROTOCOL · HACKATHON

RESOURCESReferences
## START BUILDING
Specs, demo app, explorer, docs, and sandbox.
## 01 · DEMO APP
## Lending Protocol Demo
## Application
Interactive reference app. Create a
vault, originate a loan, process
repayment. Run it on testnet to see the
full lifecycle.
github.com/ripple/lending-demo
## 02 · TECH SPEC
XLS-65 · Single Asset Vault
Full specification: vault creation,
deposits, withdrawals, share math,
clawback, donation, insolvency
handling.
xls.xrpl.org/xls/XLS-0065
## 03 · TECH SPEC
XLS-66 · Lending Protocol
Full specification: loan broker,
origination, repayment, default, fee
structure, first-loss capital.
xls.xrpl.org/xls/XLS-0066
## 04 · EXPLORER
XRPL Explorer · Vault Pages
Live vault ranking, vault detail pages,
loan tracking, protocol-wide metrics.
Due diligence in 5 minutes.
livenet.xrpl.org
## 05 · DOCS
XRPL Developer Documentation
Transaction types, ledger entries, API
references, JS and Go SDKs. The
canonical reference for building on
## XRPL.
xrpl.org/docs
## 06 · TUTORIAL
Step-by-Step Lending
## Walkthrough
End-to-end guide: create vault,
configure loan broker, originate a loan,
process repayment, handle default.
xrpl.org/docs/tutorials/lending
## 07 · SANDBOX
Testnet and Devnet
Test your integration against live
ledger replicas before mainnet. No
real assets at risk. Faucet available.
xrpl.org/resources/dev-tools
## XRPL LENDING PROTOCOL · HACKATHON