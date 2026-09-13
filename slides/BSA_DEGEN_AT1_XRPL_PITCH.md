# AT1 Bond Issuance & Investment Marketplace on XRPL

> **XRPL Lending Protocol Hackathon 2026**  
> **Team**: BSA Degen (`participant_id: sunny-puffin-57`)  
> **Track**: Track 1 (Open-ended Single Asset Vault & Lending Protocol V1)  
> **Flavour**: Loaded (XLS-65 / XLS-66 + native XRPL 2-of-2 multisig as a call-date enforcer)  
> **Presentation Duration**: 4 minutes pitch/demo + 2 minutes Q&A  

---

## Slide 1: Title & Overview

### AT1 Bonds on XRPL: Institutional Debt Meets Native Decentralized Credit

- **What we built**: An end-to-end on-chain issuance, investment, and risk-management platform for **Additional Tier 1 (AT1) Subordinated Debt**.
- **The primitives**: Native Open-Ended Single Asset Vault (**XLS-65**) paired with Lending Protocol V1 (**XLS-66**), secured by an autonomous **2-of-2 Multisig Enforcer** and **MPT Shares**.
- **Live on Devnet**: 16 verified on-chain transactions, 4 native protocol guardrails demonstrated, zero-custody architecture.

> *Speaker Note (30s)*: "Hello everyone, we are team BSA Degen. Today we're presenting AT1 on XRPL: bringing institutional Additional Tier 1 perpetual bonds onto the XRP Ledger using XLS-65 and XLS-66."

---

## Slide 2: The Problem & Use Case

### Why AT1 Bonds on XRPL?

- **TradFi Friction**:
  - $260B+ global AT1 market, but illiquid, opaque, restricted to $200k minimum tickets.
  - Opaque coupon tracking, settlement delays (T+2/T+3), and complex manual loss absorption.
- **The XRPL Opportunity**:
  - **Fractional access**: MPT-denominated vault shares enable liquid fractional participation.
  - **Automated loss absorption**: Native first-loss capital buffers (`CoverAvailable`) absorb shocks.
  - **Continuous compounding**: Yield is continuously priced into share value, not locked in periodic off-chain clearing houses.

> *Speaker Note (25s)*: "AT1 bonds are high-yield hybrid capital instruments used by banks and institutions to absorb losses. On XRPL, we turn this rigid, opaque market into a transparent, liquid, real-time yield engine."

---

## Slide 3: Architecture: 1 Bond = 1 Open-Ended SAV

### Elegance Over Complexity: Dynamic Single Asset Vaults

```text
[Corporate Borrower] ──(Emits Debt Bid)──> [VaultCreate (XLS-65)] + [LoanBrokerSet (XLS-66)]
                                                      │
[Investors / Lenders] ──(Indicative Match)──> [VaultDeposit] ──> [Mint MPT Shares @ PPS]
                                                      │
[Atomic Disbursement] <─── [LoanSet: Disburses Principal to Borrower] ─────────┘
```

- **One Vault Per Issuance**: Each bond issue is an isolated, autonomous Single Asset Vault.
- **Indicative Matching Layer**: Off-chain order matching board gives borrowers and lenders pre-execution price discovery without ledger clutter.
- **Atomicity**: Loan origination and capital disbursement occur in a single atomic transaction (`LoanSet`).

> *Speaker Note (25s)*: "When a borrower posts a debt bid, our backend instantly deploys an isolated open-ended vault. Lenders discover the terms on an indicative board, deposit funds, and receive MPT shares. Principal disburses atomically."

---

## Slide 4: Real-Time Yield & The PPS Harvest Mechanism

### Continuous Price-Per-Share (PPS) Accrual

$$\text{Price Per Share (PPS)} = \frac{\text{AssetsTotal}}{\text{SharesTotal}}$$

- **Passive Yield Distribution**: 
  - Each borrower coupon payment (`LoanPay`) deposits interest directly into the vault.
  - `AssetsTotal` rises while `SharesTotal` remains fixed $\rightarrow$ **PPS increases continuously**.
- **On-Demand Yield Harvesting (`VaultWithdraw`)**:
  - Investors can claim accrued yield *at any time* without selling their bond principal!
  - Frontend computes: $\text{Yield Shares} = \text{SharesHeld} - \frac{\text{PrincipalDeposited}}{\text{Current PPS}}$.
  - The investor executes a partial `VaultWithdraw`, burning only the yield shares.

> *Speaker Note (30s)*: "Unlike TradFi where you wait months for a coupon check, every LoanPay instantly increases the vault's PPS. Investors can click 'Harvest Yield' anytime, redeeming only the profit while leaving their principal invested."

---

## Slide 5: The Headline Challenge: The Call-Date Lock

### How to Lock Principal in an Open-Ended Vault?

- **The Paradox**: Open-ended vaults allow withdrawals at any time. How do we ensure principal stays locked until the Call Date?
- **The Native Shield**: While capital is lent out, the vault's `AssetsAvailable` is zero. Any attempt to withdraw principal natively fails with `tecINSUFFICIENT_FUNDS`.
- **The Missing Protocol Piece**: Nothing in XLS-66 prevents a borrower from paying off the loan early, which would refill vault liquidity prematurely!
- **Our Solution — 2-of-2 Multisig Gate**:
  - Borrower's master key disabled (`asfDisableMaster`).
  - Signer 1: Borrower Operator (`borrowerOp`).
  - Signer 2: **Autonomous Software Enforcer**.
  - **Zero Human Access**: The Enforcer daemon verifies the ledger timestamp algorithmically. It cryptographically refuses to co-sign full repayment before the Call Date.

> *Speaker Note (35s)*: "The vault's own illiquidity protects principal while out on loan. But to stop the borrower from paying off early and breaking the bond term, we created an autonomous software-only multisig enforcer that will not co-sign loan payoff until the exact Call Date."

---

## Slide 6: Institutional Zero-Custody Architecture

### Separation of Powers & Client Privacy

- **Broker-Only Backend Configuration**:
  - The backend `.env` contains **strictly and exclusively** `BROKER_SEED` and `BROKERENFORCER_SEED`.
  - Zero hardcoded borrower or lender private keys.
- **Decoupled Client Directory (SQLite Database)**:
  - Local database (`data/accounts.db`) stores enterprise profiles (CFO name, corporate entity, role).
  - Generates dedicated per-borrower operator keys (`borrowerOp`).
- **Cryptographic Independence**:
  - No two borrowers ever share signing credentials.
  - Lenders and borrowers connect their own wallets via `xrpl-connect` (Xaman / GemWallet / Crossmark); the backend only ever learns their public address (prepare → sign in wallet → submit).

> *Speaker Note (25s)*: "In institutional finance, brokers must not custody customer keys. Our backend only holds broker keys. All borrower and lender profiles are dynamically managed in an isolated database with dedicated signing operators."

---

## Slide 7: Live Demo & Verified On-Chain Transactions

### 16 Verified Lifecycle Transactions on Devnet

| Step | Transaction | Result Code | On-Chain State Impact |
|---|---|---|---|
| **1-3** | `VaultCreate` + `LoanBrokerSet` + `LoanBrokerCoverDeposit` | `tesSUCCESS` | Vault deployed, first-loss buffer funded |
| **4** | `VaultDeposit` (lender-signed) | `tesSUCCESS` | 200 XRP deposited, MPT shares minted at PPS 1.0 |
| **5** | `Payment` signed by the disabled master key | `tefMASTER_DISABLED` | Borrower master key is dead on-ledger |
| **6** | `LoanSet` (broker + 2-of-2 counterparty signature) | `tesSUCCESS` | Principal atomically disbursed to borrower |
| **7-8** | `LoanManage` impair (not yet due) / full `VaultWithdraw` | `tecTOO_SOON` / `tecINSUFFICIENT_FUNDS` | Guardrails hold (see next slide) |
| **9-10** | Early close before call date / `LoanPay` with 1 of 2 signatures | `blocked:before-call-date` / `tefBAD_QUORUM` | Enforcer + quorum both required |
| **11-12** | `LoanManage` impair (overdue) then unimpair | `tesSUCCESS` | `lossUnrealized` rises, PPS drops, then restored |
| **13** | `LoanPay` coupon (late-flagged) | `tesSUCCESS` | Interest paid, PPS rises |
| **14** | `VaultWithdraw` (yield-only) | `tesSUCCESS` | Yield shares redeemed; principal shares intact |
| **15** | `LoanPay` remaining coupons at the Call Date | `tesSUCCESS` | Enforcer co-signs; loan closes, all assets liquid |
| **16** | Full `VaultWithdraw` | `tesSUCCESS` | Principal + accrued yield returned to lender |

> *Speaker Note (45s)*: "[SWITCH TO LIVE SCREEN] Here is our live dashboard running on the Custom Hackathon Devnet. We see the active bond vault, the real-time PPS, and our 4-pane tmux environment coordinating the Enforcer, Shim, and UI."

---

## Slide 8: Demonstrated Protocol Guardrails

### Stress-Testing XLS-65 & XLS-66 Constraints

1. **Illiquid Capital Guardrail (`tecINSUFFICIENT_FUNDS`)**:
   - Investor attempts full principal withdrawal while funds are out on loan.
   - Verified rejection hash: `C4240633AC...` — Native proof that principal cannot be drained.
2. **Multisig Quorum Guardrail (`tefBAD_QUORUM`)**:
   - A coupon `LoanPay` signed by the borrower's operator key alone, without the Enforcer.
   - Rejected on-ledger: quorum threshold of 2 is strictly required.
3. **Premature Impairment Guardrail (`tecTOO_SOON`)**:
   - Broker calls `tfLoanImpair` on an on-time loan under `fixCleanup3_4_0`.
   - Verified rejection hash: `34AE03134F...` — Ledger enforces that loans must be overdue.
4. **Master Key Disabled Guardrail (`tefMASTER_DISABLED`)**:
   - Borrower attempts direct submission without multisig operator keys.

> *Speaker Note (30s)*: "We didn't just test the happy path. We proved that the ledger enforces the exact guardrails required by Track 1: premature withdrawals fail, partial multisig fails, and premature write-down is rejected by protocol logic."

---

## Slide 9: Top Developer Feedback (40% Criterion)

### Concrete Proposals for Ripple & the XRPL Community

1. **Native `SignerCondition` on `SignerListSet` (Headline Proposal)**:
   - *Problem*: Multisig cannot restrict signing time, requiring our off-chain Enforcer daemon.
   - *Fix*: Add `SignAfter` / `SignBefore` timestamps to `SignerEntry` on core XRPL.
2. **Spec Alignment on `InterestDue` (§3.8.6 item 6)**:
   - *Problem*: XLS-66 spec claims `AssetsTotal` increases by `InterestDue` on origination. On `rippled 3.4.0-rc1`, it stays flat until coupons are paid.
   - *Fix*: Update the official documentation or clarify the amendment version difference.
3. **Devnet Infrastructure on Port 443**:
   - *Problem*: Hackathon venue Wi-Fi blocked TLS on rippled ports 51233/51234.
   - *Fix*: Reverse-proxy devnet WSS/RPC over standard HTTPS port 443.

> *Speaker Note (35s)*: "For the 40% feedback criterion, our top recommendation is introducing a native SignerCondition in SignerListSet. Adding time-locked signing to XRPL multisig would make fixed-maturity debt 100% native without any off-chain daemons."

---

## Slide 10: Conclusion & What We Contributed Back

### Institutional Debt is Ready for XRPL

- **Production Roadmap**:
  - Hardware Enclave (AWS Nitro Enclave / TEE) for zero-human Enforcer deployment.
  - Native **TokenEscrow (XLS-85)** composition for on-chain escrowed repayments.
- **Contributions Back to the Ecosystem**:
  - **Full E2E Test Suite**: 16-step verified on-chain lifecycle test runner (`npm run e2e`).
  - **15 Detailed Friction Entries**: Complete documentation in `FEEDBACK_REPORT.md` and `docs/friction-log.md`.
  - **Automated DevEx Hook Active**: Telemetry logged via `xrpl-devex-hook`.

### Thank you! Questions & Answers (2 mins)

> *Links*:
> - GitHub: `github.com/G4SP4RDDB/AT1_XRPL`
> - Live Explorer: `custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233`
> - Feedback Report: `FEEDBACK_REPORT.md` at repository root
