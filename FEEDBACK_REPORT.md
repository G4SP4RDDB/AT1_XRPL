# Developer Feedback Report — XRPL Lending Protocol Hackathon 2026

**Track**: Track 1 (Open-ended Single Asset Vault & Lending Protocol V1)  
**Flavour**: Loaded (XLS-65 / XLS-66 + native XRPL 2-of-2 multisig as a call-date enforcer)  
**Environment**: Custom Hackathon Devnet (`rippled 3.4.0-rc1`, `lending-hackathon.dev.ripplex.io:51233`, reserve: 10 XRP base + 2 XRP/object)  
**Library & Version**: `xrpl.js 5.2.0` (Stable)  
**Team**: BSA Degen (`participant_id: sunny-puffin-57`)  

---

## Executive Summary

Over the 36-hour hackathon, we built an on-chain **Additional Tier 1 (AT1) Bond Issuance & Investment Marketplace** on the XRP Ledger. Our design pairs an open-ended Single Asset Vault (**XLS-65**) with a lending facility (**XLS-66**), delivering continuous Price-Per-Share (PPS) yield accrual, on-demand yield harvesting, and a fixed Call Date maturity.

Rather than relying on closed-ended phase gating (Track 2), we implemented the Call Date lock through native vault illiquidity combined with an **on-chain 2-of-2 Multisig gate** (`SignerListSet` + `asfDisableMaster`) governed by an autonomous, software-only **Enforcer Daemon**. 

Across 16 on-chain verified transactions and four intentional protocol guardrail rejections, we encountered **15 distinct developer friction points**. Per the hackathon evaluation philosophy (*"Proposals score above flagging"*), this report details our four primary friction areas, citing exact ledger codes, SDK behaviors, and concrete architectural proposals for Ripple and the XRPL community.

---

## 1. The Multisig Temporal Gap: Call Date Enforcement (Headline Finding)

### The Problem & Friction
In institutional debt (AT1 bonds), capital must remain locked until the agreed Call Date. Under XLS-65, principal is naturally illiquid while out on loan—attempting a full `VaultWithdraw` correctly triggers `tecINSUFFICIENT_FUNDS`. However, **nothing in XLS-66 natively prevents an issuing borrower from repaying early via `LoanPay`**, which would instantly refill `AssetsAvailable` and make principal liquid before the agreed maturity.

While XRPL provides native multisig (`SignerListSet`), it possesses **no native temporal semantics**: an $N$-of-$M$ quorum defines *who* signs, but cannot restrict *when* a signature is valid. Consequently, to enforce a maturity date:
1. The borrower's master key must be permanently disabled (`asfDisableMaster: 4`).
2. The second signature must be held by an **autonomous software daemon with Zero Human Access**. If any human operator possessed this key, the bond maturity would devolve into an off-chain discretionary trust assumption.

### Observed Ledger & SDK Friction
- Attempting to add the borrower to its own `SignerListSet` fails with `temBAD_SIGNER` ($\text{SignerEntry.Account} \neq \text{Account}$), requiring a separate operator key (`borrowerOp`).
- In `xrpl.js`, calling `signLoanSetByCounterparty` with a string argument for `multisign` caused duplicate signer errors (`Signers[0].Account == Signers[1].Account`), because the SDK treated the account address as an X-address rather than evaluating multisig contexts. Passing a boolean was required.

### Proposed Solutions
1. **Native `SignerCondition` in `SignerListSet` (Protocol-Level)**: Introduce an optional `SignAfter` / `SignBefore` Ripple-epoch timestamp within `SignerEntry`. The ledger engine would natively reject transactions signed by a temporal signer before its activation time with `tefSIGNER_NOT_ACTIVE`. This would eliminate off-chain policy daemons entirely.
2. **Loaded Composition via TokenEscrow / XLS-85**: Anchor the borrower's repayment funds into a native `TokenEscrow` with a `FinishAfter: callDate` condition, coupling escrow release atomically with `LoanPay`. We confirmed the `TokenEscrow` amendment is enabled on the hackathon devnet (`npm run check`), so this is buildable today; we did not ship it within the 36 h because the escrow release and the `LoanPay` are still two separate transactions with no atomic link, which is the exact gap a native `SignAfter` would close.
3. **Hardware Enclave (TEE / HSM) Enforcer**: In production, the software enforcer daemon must run inside an AWS Nitro Enclave or SGX enclave where zero human operator keys exist, and signing logic is cryptographically bound to on-chain ledger close time.

---

## 2. XLS-65/66 Liquidity, Rates & Amortisation Mechanics

### The Problem & Spec Discrepancies
- **`LoanDraw` Does Not Exist**: Initial hackathon documentation and traditional loan models suggest an explicit drawdown step (`LoanDraw`). In reality, `LoanSet` executes origination and atomic disbursement simultaneously.
- **Spec vs. Devnet Implementation on `InterestDue`**: XLS-66 specification §3.8.6 item 6 states: *"Increase `Vault.AssetsTotal` by `InterestDue` upon loan origination"*. On the live Devnet (`rippled 3.4.0-rc1`), `AssetsTotal` remained strictly unchanged after `LoanSet` (1,000 XRP), and only increased when actual coupons landed via `LoanPay`. This required refactoring our off-chain PPS valuation models.
- **`AssetsMaximum` Blocks Origination with Ambiguous Codes**: Setting `AssetsMaximum` equal to the raised principal causes subsequent `LoanSet` transactions to fail with `tecLIMIT_EXCEEDED`, because the ledger engine enforces that the cap must accommodate $\text{AssetsTotal} + \text{InterestDue}$. The error code gives no indication of whether the vault deposit cap or the loan interest headroom triggered the failure.
- **Rate Scaling on Devnet**: Interest rates are specified in tenths of a basis point annualised ($1 = 0.001\%$), with a 60-second minimum payment interval. A 10-minute demo loan at 100% APR earns mere fractions of a drop on small principals, frequently hitting `tecPRECISION_LOSS` (§3.8.5.2).

### Proposed Solutions
- Update XLS-66 §3.8.6 to reflect actual `AssetsTotal` ledger behavior, or document the amendment version change.
- Split `tecLIMIT_EXCEEDED` into `tecVAULT_CAP_EXCEEDED` and `tecLOAN_HEADROOM_EXCEEDED`, or add an `InterestDueHeadroom` field to the `vault_info` RPC output.
- Provide an official Devnet rate calculation helper in `xrpl.js` (`calculateDevnetLoanTerms(principal, durationSeconds, targetYield)`).

---

## 3. Loan Termination, Repayment Flags & Impairment Gating

### The Problem & Findings
- **Late Payment vs. Full Payoff Mutually Exclusive**: Once a scheduled loan payment is overdue, `LoanPay` strictly requires `tfLoanLatePayment` (`0x00040000`). However, this flag is mutually exclusive with `tfLoanFullPayment` (`0x00020000`). If a borrower attempts to clear a delinquent loan in a single bullet payment, the transaction is rejected with `tecEXPIRED`. The borrower must first submit a separate transaction for the late fee/coupon, and then submit a second transaction for principal payoff.
- **Reserve Shortfalls Masked as `tecINSUFFICIENT_FUNDS`**: Depositing an account's entire balance (e.g. 1,000 XRP from a fresh faucet account) returns `tecINSUFFICIENT_FUNDS`. In reality, the account had sufficient funds for the deposit, but could not cover the 10 XRP base reserve plus the 2 XRP owner reserve for the newly minted `MPToken` share object.
- **Undocumented `fixCleanup3_4_0` Gating on Impairment**: In workshop materials, `LoanManage` write-down (`tfLoanImpair`) is described as a discretionary broker risk action. On the Devnet, under `fixCleanup3_4_0`, calling `tfLoanImpair` on a current loan returns `tecTOO_SOON` unless `ledgerCloseTime > NextPaymentDueDate`. Attempting `tfLoanUnimpair` on a healthy loan then returns `tecNO_PERMISSION`, which misleadingly mimics an authentication failure.

### Proposed Solutions
- Allow `tfLoanFullPayment` to atomically sweep and settle accrued late fees and overdue payments in a single transaction.
- Introduce `tecINSUFFICIENT_RESERVE` distinct from `tecINSUFFICIENT_FUNDS`, and add an SDK balance pre-flight check that accounts for object creation reserves.
- Clarify in XLS-66 documentation that impairment is strictly an overdue-triggered state machine, and return `tecLOAN_NOT_IMPAIRED` rather than `tecNO_PERMISSION` on invalid unimpair calls.

---

## 4. DevEx, Network Infrastructure & Client SDK Friction

### Network TLS Drops on Non-Standard Ports
During on-site venue development, local Wi-Fi firewalls repeatedly dropped or stalled TLS handshakes targeting `rippled` ports `51233` (WSS) and `51234` (JSON-RPC), completely blocking CLI commands, while port `443` (faucet) operated normally. 
- *Proposed Fix*: Devnet endpoints should always expose a port `443` reverse-proxy alias (e.g. `https://lending-hackathon.dev.ripplex.io/rpc` and `wss://lending-hackathon.dev.ripplex.io/ws`).

### SDK Client Timeout Ambiguity
In `xrpl.js 5.2.0`, `new Client(url, { timeout: 15000 })` configures the individual request timeout but leaves the WebSocket connection handshake timeout at the default 5,000 ms. Under network latency, connections fail with a timeout error that only reveals the true configuration option (`connectionTimeout`) in the error trace.
- *Proposed Fix*: Harmonize `connectionTimeout` with `timeout` as a fallback, or raise default connection timeout to 15,000 ms.

---

## Summary Matrix of Findings & Actionable Proposals

| Area | Observed Friction | Severity | Exact Ledger / Code Point | Actionable Proposal |
|---|---|---|---|---|
| **Security** | Multisig lacks native time restriction | **High** | Core `SignerListSet` | Add `SignerCondition` (`SignAfter`) or combine with `TokenEscrow` |
| **Protocol** | `LoanDraw` does not exist | **Medium** | XLS-66 / `xrpl.js` models | Update overview docs: `LoanSet` disburses atomically |
| **Spec** | `AssetsTotal` does not book `InterestDue` | **High** | XLS-66 §3.8.6 item 6 | Align spec text with `rippled 3.4.0-rc1` implementation |
| **Protocol** | `AssetsMaximum` blocks loan origination | **Medium** | `tecLIMIT_EXCEEDED` (§3.8.5.2) | Separate cap vs. interest headroom error codes |
| **Protocol** | `tfLoanFullPayment` fails on overdue loans | **Medium** | `tecEXPIRED` on `LoanPay` | Allow atomic payoff of late fees + remaining principal |
| **Protocol** | Impairment rejected on current loans | **Medium** | `tecTOO_SOON` / `fixCleanup3_4_0` | Document overdue precondition; improve unimpair error code |
| **SDK** | Counterparty multisig string ambiguity | **Medium** | `signLoanSetByCounterparty` | Clarify X-address parameter vs boolean multisig flag |
| **Infra** | Devnet TLS dropped on 51233/51234 | **High** | Venue network / ports | Host WebSocket and RPC on standard port 443 |
| **Financial** | Lack of Rate Reset / Variable Interest Rate | **High** | `LoanSet.InterestRate` immutable | Integrate XLS-47d Oracles or add `LoanBrokerRateReset` |

---

## Conclusion

The XLS-65 and XLS-66 amendments provide a robust, mathematically sound foundation for institutional credit on XRPL. Implementing an AT1 bond revealed that while native primitives handle risk buffers and continuous yield remarkably well, real-world fixed-income products require temporal guarantees on capital return. Addressing the **multisig temporal gap**—either natively via `SignerCondition` or compositionally via `TokenEscrow`—will establish XRPL as the premier layer-1 ledger for regulated capital market debt issuance.
