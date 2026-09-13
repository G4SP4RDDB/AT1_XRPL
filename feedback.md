# Feedback

XRPL Lending Protocol Hackathon 2026 · Track 1, open-ended vault + Lending Protocol V1 · Team BSA Degen

## Protocol

**01 — Let the curator cap the withdraw**

An optional `WithdrawalCap` on `VaultCreate`, set by the curator and enforced by the ledger on every `VaultWithdraw`. Today the entry side is configurable (`AssetsMaximum`, `tfVaultPrivate`, `DomainID`) and the exit side has nothing, so a vault holding term loans redeems on a first-come basis: early depositors take the free cash, the rest hold shares against outstanding principal. Pair it with `WithdrawalPeriodSeconds` and it expresses a redemption window instead of a flat limit. It should be readable before deposit, relaxable but never tightenable, and refusals should carry their own result code so a client can tell a gated withdrawal from an illiquid one.

**02 — Make vault ownership transferable**

A `Vault` or `LoanBroker` is permanently bound to its creating account. `VaultSet` cannot change the owner, so a curator cannot appoint a successor, migrate from a founder key to a corporate account, or hand a mandate over; the only exit is to wind down and re-issue, which discards the loan book and re-onboards every depositor. Account authority is rotable, object ownership is not, so a lost quorum key freezes third-party deposits permanently and a leaked seed turns recovery into a race. We would ask for a two-step transfer: the owner nominates, the successor accepts. If terminal ownership is deliberate, one sentence in the spec saying so would let integrators design custody around it.

**03 — Let a vault or broker restrict who borrows**

Neither `VaultCreate` nor `LoanBrokerSet` can restrict the `Counterparty` of a `LoanSet`, so a single-issuer vault has to enforce its own issuer off-chain. The odd part is that the ledger already knows how to express this on the other side: `tfVaultPrivate` plus a `DomainID` restricts deposits to Credential holders. A `DomainID` on `LoanBrokerSet`, or an `AllowedCounterparty`, would close the asymmetry with the mechanism that already exists.

**04 — No way to prevent early repayment on-chain**

Nothing stops a borrower from closing with `tfLoanFullPayment` at any time, which refills the vault and lets everyone exit. Any callable or term instrument needs the opposite guarantee, and the only way to build it today is a signer list where an off-chain daemon refuses to co-sign before a date. The lockout is a term of the loan, so the natural home is the loan: a `NoCallBefore` field set at `LoanSet` and checked by the engine on `tfLoanFullPayment`. That is a smaller change than a time condition on `SignerEntry` and does not touch the signing model.

**05 — Result codes that do not say which limit was hit**

`LoanSet` with `AssetsMaximum` set to exactly the amount raised fails `tecLIMIT_EXCEEDED`, because the cap has to hold the interest too, and the code does not say which cap tripped. Depositing a fresh account's full balance fails `tecINSUFFICIENT_FUNDS` when the real blocker is the reserve for the new `MPToken`; `tecINSUFFICIENT_RESERVE` would point straight at it. Both cost an hour of looking in the wrong place.

## Spec

**06 — The spec contradicts the ledger on origination**

§3.8.6 item 6 says origination books `InterestDue` into `AssetsTotal`. It does not: after `LoanSet`, `AssetsTotal` stayed at 200,000,000 drops while the loan reported `TotalValueOutstanding` 200,000,762, and the figure only moved on the first coupon. A documented behaviour that is wrong costs more than an undocumented one, because you build on it before you test it.

**07 — Values that exist nowhere in writing**

The three `LoanPay` flags are tabulated nowhere (`tfLoanOverpayment 0x10000`, `tfLoanFullPayment 0x20000`, `tfLoanLatePayment 0x40000`), and their interactions are not written down either: `tfLoanLatePayment` cannot combine with `tfLoanFullPayment`, and a final repayment at maturity is not a full payment at all, just the last coupon. Separately, `signLoanSetByCounterparty` uses its own hash prefixes (`0x43505400`, `0x43504d00`) that XLS-66 never mentions, which makes the counterparty signature impossible to implement in a wallet. One sentence on what that signature signs would unblock it.

## Tooling

**08 — `xrpl-connect` cannot address a custom network**

The adapter identifies networks by CAIP id and only knows `xrpl:0/1/2`. On a custom devnet, pairing requests a chain the wallet never approves, and every subsequent request is discarded client-side before the wallet sees it. Reading the chain from the live session, and an `xrpl:<NetworkID>` convention, would let custom networks exist at all. Three smaller fixes in the same file: `sign()` returns the bare `TxnSignature` as `tx_blob` instead of an encoded blob, `autofill` is hardcoded to `true` with no way to opt out when the backend has already filled the transaction, and `reconnect()` proposes a new pairing rather than resuming the session, so a page reload logs the user out.
