# AT1 Bond Issuance & Marketplace on XRPL (XLS-65 / XLS-66)

> **XRPL Lending Protocol Hackathon 2026** · Track 1 (open-ended Single Asset Vault + Lending Protocol V1)
> **Team** BSA Degen · **Flavour** Loaded: XLS-65/66 + native XRPL 2-of-2 multisig used as a call-date enforcer
> **Network** Custom Hackathon Devnet (`rippled 3.4.0-rc1`) · **Library** `xrpl.js 5.2.0` (stable)

An Additional Tier 1 (AT1) bond platform built on the XRP Ledger's native vault (**XLS-65**) and lending (**XLS-66**) primitives. One bond = one vault. Investors earn a continuously accruing yield they can harvest at any time, while their principal stays locked until the bond's call date.

**Contents**
1. [What it is](#1-what-it-is)
2. [How a bond lives on the ledger](#2-how-a-bond-lives-on-the-ledger)
3. [The call-date lock and the enforcer](#3-the-call-date-lock-and-the-enforcer)
4. [Accounts and custody](#4-accounts-and-custody)
5. [Architecture](#5-architecture)
6. [On-chain proof: 17 verified steps](#6-on-chain-proof-17-verified-steps)
7. [Run it](#7-run-it)
8. [Using the app](#8-using-the-app)
9. [Tests and verification](#9-tests-and-verification)
10. [Scripts reference](#10-scripts-reference)
11. [Environment and network](#11-environment-and-network)
12. [Known limitations](#12-known-limitations)
13. [Deliverables and documentation index](#13-deliverables-and-documentation-index)

---

## 1. What it is

In traditional finance an **AT1 bond** is subordinated debt that pays a high periodic coupon, absorbs losses first when the issuer gets into trouble, and has a **call date** at which the issuer redeems the principal. Investors cannot get their principal back before that date.

This platform maps each of those properties onto a native XRPL primitive:

| AT1 property | On XRPL |
|---|---|
| One bond issuance | One open-ended Single Asset Vault (`VaultCreate`), created when the issuer posts an ask |
| Investor subscription | `VaultDeposit`: XRP in, MPT vault shares out at the current price per share |
| Coupon | `LoanPay` by the issuer: raises the vault's assets, so the **price per share (PPS = AssetsTotal / SharesTotal)** rises for every holder |
| Harvesting the coupon | A partial `VaultWithdraw` sized to the accrued yield, leaving the principal shares untouched |
| Principal locked until the call date | Two layers: the vault is illiquid while the principal is out on loan (native `tecINSUFFICIENT_FUNDS`), and an early payoff by the issuer needs a co-signature the platform's **enforcer** only gives at or after the call date (§3) |
| Loss absorption | Broker first-loss capital (`LoanBrokerCoverDeposit`) and write-down via `LoanManage tfLoanImpair` |
| Discovery | The Finance Bonds list, read from the ledger; nothing is written on-ledger until a deposit happens |

The frontend is a marketplace: issuers post **asks** (amount, yield, call date) that become vaults, investors fund them straight from the bond list with a `VaultDeposit` signed in their wallet (an off-chain bid / accept / decline layer was built and removed on the last morning; funding is direct).

---

## 2. How a bond lives on the ledger

The full lifecycle, in the order the code runs it:

1. **Issuer posts an ask** → the platform (as Loan Broker) submits `VaultCreate`, `LoanBrokerSet` and `LoanBrokerCoverDeposit` (first-loss buffer).
2. **Investor deposits** → `VaultDeposit`, signed by the investor's own wallet. Shares are minted at the current PPS.
3. **Origination, automatic** → the deposit that brings the vault's liquid assets up to the ask's principal triggers `LoanSet` at once, signed by the broker and counter-signed by the issuer's 2-of-2 signer set. Principal moves to the issuer in this same transaction (there is no separate `LoanDraw` in XLS-66). The vault is bound to its issuer: the ask stored in the vault's `Data` field names the borrower, and both the shim and the enforcer refuse a `LoanSet` whose `Counterparty` is anyone else. If the issuer has not activated 2/2 yet, the deposit stands and origination waits (a manual *Originate* button remains as fallback). An ask that never fills is settled by a background scan in the shim once its funding window (`expiresAt`, off-chain) has passed: originated for whatever was raised if at least 50 % of the principal came in, otherwise left for depositors to withdraw.
4. **Coupons** → `LoanPay` on each due date, co-signed by the enforcer. An XLS-66 loan amortises: each instalment is `PeriodicPayment` = a slice of principal + the period's interest (there is no interest-only schedule), and the interest part raises PPS.
5. **Yield harvest** → partial `VaultWithdraw` of the yield-equivalent shares only, at any time.
6. **Call date** → the issuer settles the remaining scheduled coupons (`LoanPay`, late ones flagged `tfLoanLatePayment`); the last one closes the loan and the vault becomes fully liquid.
7. **Redemption** → full `VaultWithdraw`: principal plus every accrued increment of yield.

Transactions used, and what each does here:

| Transaction | Spec | Used for |
|---|---|---|
| `VaultCreate` | XLS-65 | One open-ended vault per bond, capped at the ask amount |
| `VaultDeposit` | XLS-65 | Investor funding; mints MPT shares at the current PPS |
| `VaultWithdraw` | XLS-65 | Yield-only partial redemption at any time; full redemption after the loan closes |
| `LoanBrokerSet` | XLS-66 | Broker terms: rate bounds, fees, cover requirements |
| `LoanBrokerCoverDeposit` | XLS-66 | Broker posts first-loss capital |
| `LoanSet` | XLS-66 | Origination and atomic disbursement, broker + issuer counter-signature |
| `LoanPay` | XLS-66 | Coupons, late coupons (`tfLoanLatePayment`), early close (`tfLoanFullPayment`, enforcer-gated) |
| `LoanManage` | XLS-66 | Write-down (`tfLoanImpair`) and restoration (`tfLoanUnimpair`) by the broker |
| `SignerListSet` | core | 2-of-2 signer list on issuer/investor accounts: operator key + platform enforcer |
| `AccountSet` | core | `asfDisableMaster` on those accounts, so only the signer list can act |

---

## 3. The call-date lock and the enforcer

**The problem.** An open-ended vault lets depositors withdraw whenever there is liquidity, and nothing in XLS-66 stops an issuer from repaying early. Repaying early would refill the vault and let investors pull principal before the call date. Multisig alone does not help: an XRPL signer list says *who* signs, never *when*.

**The mechanism.** The issuer's account is converted to a 2-of-2 multisig (`SignerListSet`) with its master key disabled (`AccountSet asfDisableMaster`). One signer is the issuer's operator key; the other is the platform **enforcer**, an autonomous daemon (`src/chain/enforcer/`, port 8788) whose only job is to apply a fixed policy before adding its signature:

- **`LoanPay` (issuer)** — the loan must be brokered by this platform. `tfLoanFullPayment` (an early close) is refused while the validated ledger close time is before the call date (`blocked:before-call-date`). A coupon must be exactly `PeriodicPayment + LoanServiceFee`, or, once overdue, carry `tfLoanLatePayment` with at least that plus the late fee (`wrong-amount` otherwise).
- **`VaultWithdraw` (investor with multisig active)** — redeeming up to the account's accrued yield shares is co-signed at any time; anything beyond that (principal) is co-signed only once the vault's loan is closed (`unauthorized-principal-withdrawal`). This is the investor-side half of the lock.
- Anything else is refused (`not-loan-pay` / `not-supported`). A refusal returns `{ blocked, reason }` and nothing reaches the ledger.

Routes: `POST /cosign` (the policy above), `POST /counter-sign` (the enforcer's `LoanSet` counterparty signature at origination; refused unless the `LoanBroker` is the platform's and the `Counterparty` is the issuer recorded in the vault's `Data`, `not-issuer` otherwise), `GET /health`.

**Why zero human access matters.** The enforcer's key (`ENFORCER_SEED` in `.enforcer.env`, mode `0600`) is read only by the daemon. It is never printed, never sent to the frontend, and there is no route that signs on request. If any person could co-sign on demand, the call date would be a promise, not a rule. In production the daemon belongs in a confidential enclave (AWS Nitro, HSM or TEE) so that even `root` on the host cannot extract the key or force a signature.

**What the ledger proves and what it does not.** Both bypasses are rejected by the ledger itself, not by application code: a transaction signed with the disabled master key fails `tefMASTER_DISABLED`, and a `LoanPay` carrying only the operator's signature fails `tefBAD_QUORUM` (§6, rows 5 and 11). What remains off-chain is the *timing* rule, which lives in the daemon's policy. That gap is the headline of our [feedback report](FEEDBACK_REPORT.md): we propose a native `SignAfter` condition on `SignerEntry`, or a `TokenEscrow` (XLS-85, enabled on this devnet) with `FinishAfter = callDate` composed with the repayment.

---

## 4. Accounts and custody

**The broker is the only account the backend owns.** The backend *is* the Loan Broker. `.env` holds exactly two keys, both generated by `npm run fund:setup` and never committed:

```env
BROKER_SEED=s████████████████████████████
BROKERENFORCER_SEED=s████████████████████████████
```

The broker creates vaults, sets broker terms, posts first-loss cover, originates loans and triggers write-downs. Its seed signs those directly.

**Issuers and investors bring their own wallets.** They fund a Devnet account (`npm run create-accounts N` prints funded addresses and seeds to import into a WalletConnect-compatible wallet such as Xaman) and connect through `xrpl-connect`'s **WalletConnect** adapter (QR code / deep link). That is the only connection method, for investors, issuers and the platform broker alike. The backend only ever learns the public address. Every transaction that needs their signature follows **prepare → sign → submit**: the backend autofills the JSON, the wallet signs it, the backend relays the blob. See [`docs/chain-api.md`](docs/chain-api.md) for the routes.

**Onboarding.** The first time an address connects, a modal asks one question: is this account an **Issuer (borrower)** or an **Investor (lender)**? Nothing else. The profile (reopened from the navbar pill) only adds the institution name. The 2-of-2 multisig governance is activated where it is needed: on the Issue tab for an issuer (**Activer 2/2**, before originating), in the withdraw modal for an investor. When an owner does activate multisig, their own wallet signs the `SignerListSet` + `AccountSet` pair, so the backend can never flip an account to multisig without consent. The `broker` role is reserved for the platform's own address and opens an admin panel.

**Why the operator key is backend-held (a documented SDK gap).** No wallet adapter available for this hackathon (`xrpl-connect 0.8.2`: GemWallet, Crossmark, Xaman over WalletConnect) can produce a multisig-shaped `Signers` signature, nor the `CounterpartySignature` that `LoanSet` requires from the issuer. Both need a raw private key through `xrpl.js`'s `Wallet`. So each multisig account gets a dedicated operator key pair generated and held by the backend; the *decision* to convert stays with the owner. Details and the proposed fix: [`docs/borrower-lender-custody.md`](docs/borrower-lender-custody.md).

**Why the issuer account and its operator key are distinct.** XRPL forbids an account from appearing in its own signer list (`temBAD_SIGNER`), and once the master key is disabled the account cannot sign for itself (`tefMASTER_DISABLED`). Hence three parties: the issuer's treasury account (holds the debt), its operator key (signer #1), the platform enforcer (signer #2, checks the call date).

**Local participant registry** (`data/accounts.db`, SQLite via `better-sqlite3`, `src/db/index.ts`):

| Column | Meaning |
|---|---|
| `address` | Classic XRPL address, primary key |
| `role` | `borrower`, `lender` or `broker` (`CHECK` constraint) |
| `name`, `firstName`, `userRole`, `company` | Onboarding identity |
| `seed` | Devnet test seed, only for accounts generated by the local scripts; wallet-connected accounts never hand one over |
| `operatorAddress`, `operatorSeed` | The dedicated operator key for multisig co-signing |
| `multisigActive` | `1` once `SignerListSet` + `asfDisableMaster` are confirmed on-chain |
| `createdAt` | ISO timestamp |

**Loss absorption.** If a coupon is missed (`now > NextPaymentDueDate`), the broker submits `LoanManage tfLoanImpair`: the vault's `lossUnrealized` rises and PPS drops, funded first by the broker's cover. `tfLoanUnimpair` restores it. The devnet refuses impairment on a current loan (`tecTOO_SOON`). API: `POST /tx/impair` with `{ "args": ["<LOAN_ID>"] }`.

---

## 5. Architecture

```mermaid
flowchart TD
    subgraph UI ["Frontend (:5173)"]
        React["React 19 + TypeScript + Vite"]
        Wallet["xrpl-connect: WalletConnect (Xaman)"]
        Book["Finance Bonds list + Fund modal"]
        Dash["Vault, PPS and yield dashboard"]
    end

    subgraph Backend ["Backend services"]
        Shim["Chain shim (:8787)\nsrc/chain/server.ts"]
        Enforcer["Enforcer daemon (:8788)\nsrc/chain/enforcer/server.ts"]
        Read["Ledger read layer\nsrc/chain/readLayer.ts"]
        DB[("SQLite registry\ndata/accounts.db")]
    end

    subgraph Ledger ["XRPL Custom Hackathon Devnet"]
        Vault["XLS-65 Single Asset Vault + MPT shares"]
        Lending["XLS-66 Lending Protocol V1"]
        Multisig["2-of-2 signer lists on issuer / investor accounts"]
    end

    UI -->|JSON over HTTP| Shim
    UI -->|sign prepared tx| Wallet
    Shim --> Read
    Shim --> DB
    Shim -->|"/cosign, /counter-sign"| Enforcer
    Read -->|read state| Ledger
    Shim -->|submit| Ledger
    Enforcer -->|co-signature| Multisig
```

| Service | Where | What it does |
|---|---|---|
| **Frontend** | `frontend/`, port 5173 | Wallet connection and onboarding, the Finance Bonds list with a direct *Fund* modal (remaining capacity read from the live vault), live PPS, yield-only or full withdrawal, transaction toasts with explorer links. The platform broker address opens an admin panel. |
| **Chain shim** | `src/chain/server.ts`, port 8787 | JSON-over-HTTP API: `read.*`, `tx.*`, `profile.*`, `book.*`. Loads only `BROKER_SEED`. User transactions are prepared here, signed in the wallet, submitted here. |
| **Enforcer** | `src/chain/enforcer/server.ts`, port 8788 | Holds the enforcer key; applies the §3 policy against the validated ledger close time before co-signing. |
| **Registry** | `data/accounts.db`, `src/db/index.ts` | Participants, onboarding profiles, operator key pairs. |

---

## 6. On-chain proof: 17 verified steps

One bond (200 XRP, 100 % annual, 3 coupons to a 3-minute call date), run top to bottom against the Custom Hackathon Devnet by `npm run e2e` on 13 September with wallet-onboarded issuer and investor accounts. Every step matched its expected result. Rows marked 🛡️ are deliberate rejections, proving the guardrails hold on-ledger. Full report: [`docs/e2e-full-report.md`](docs/e2e-full-report.md).

| # | Step | Result | Explorer |
|---|---|---|---|
| 1 | `VaultCreate` | ✅ `tesSUCCESS` | [`9805777345…`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/980577734513482A6C5F4907838FFF8CC730D0E14139491F53FC4DB06FD4CCCA) |
| 2 | `LoanBrokerSet` | ✅ `tesSUCCESS` | [`0CD58B43E5…`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/0CD58B43E5A0711A44D9633EAA56519F6973FC5D707628D055EBD54B5E42AB2B) |
| 3 | `LoanBrokerCoverDeposit` (first-loss buffer) | ✅ `tesSUCCESS` | [`111DEB0A51…`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/111DEB0A516809043A575E8EC8E445E0990FBB5D40701C6515DC4946575EB28F) |
| 4 | `VaultDeposit`, investor-signed, 200 XRP | ✅ `tesSUCCESS` | [`C0ECA725EF…`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C0ECA725EFFAB3B7813014B89E97B1B6584BD72A27CF5DE9B943CB357113231E) |
| 5 | `Payment` signed by the disabled master key | 🛡️ `tefMASTER_DISABLED` | rejected before validation |
| 6 | `LoanSet`, **originated automatically by the funding deposit**, broker + 2-of-2 counterparty signature | ✅ `tesSUCCESS` | [`13BD51C521…`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/13BD51C521276B5F058880C4A904CAE221900C310C82A3FFC10138923A1679E4) |
| 7 | `LoanSet` for a counterparty other than the vault's issuer | 🛡️ `blocked:not-issuer` | refused by the shim and the enforcer policy, never submitted |
| 8 | `LoanManage tfLoanImpair` on a loan not yet due | 🛡️ `tecTOO_SOON` | [`92D7F9C9DC…`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/92D7F9C9DC54692EA58775E37ADF44D90C08E78DE20B2048A7A5F9853C9929BB) |
| 9 | Full `VaultWithdraw` while principal is on loan | 🛡️ `tecINSUFFICIENT_FUNDS` | [`E43360B573…`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/E43360B57339F8798A92BA179CDFA5F8FC05ABBF62CCC97A32D49154F87D71B7) |
| 10 | Early close (`tfLoanFullPayment`) before the call date | 🛡️ `blocked:before-call-date` | refused by the enforcer, never submitted |
| 11 | `LoanPay` with 1 of 2 signatures | 🛡️ `tefBAD_QUORUM` | rejected before validation |
| 12 | `LoanManage tfLoanImpair` once overdue | ✅ `tesSUCCESS` | [`04E8DC5E44…`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/04E8DC5E44D5B070D9DA6E345C0E5518193C95116A19CD8A4E1A52BCCEB0C0D2) |
| 13 | `LoanManage tfLoanUnimpair` | ✅ `tesSUCCESS` | [`A997BC778F…`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/A997BC778F2A52DA136C6838441FDC3E10B327410828A5F90D64470F2E60C042) |
| 14 | `LoanPay` coupon #1, late-flagged; PPS rises | ✅ `tesSUCCESS` | [`32606E7E79…`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/32606E7E79C0094253A109A6AA41B263E2FB9F549B58D5764968B0DC0958E5D5) |
| 15 | `VaultWithdraw`, yield only; principal shares intact | ✅ `tesSUCCESS` | [`AC398BCDD3…`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/AC398BCDD3DC2F865A58BA6BBA6CE969389514A26965A976B7253A5DC8C05293) |
| 16 | Settlement at the call date: remaining coupons (`tfLoanLatePayment`), last one closes the loan | ✅ `tesSUCCESS` | [`8FF45F30B6…`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/8FF45F30B620EA9399356BE1F9CAE0813CBDC74644AFA93B1F81CCB1C8429407) |
| 17 | Full `VaultWithdraw`: principal + all accrued yield | ✅ `tesSUCCESS` | [`FD8835CBF7…`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/FD8835CBF79C4F4716E349E511E7235883F0027B684E27FA38567B0C0173816F) |

Rows 9 and 10 together are the call-date lock in action: the ledger refuses the investor's principal while it is on loan, and the enforcer refuses to let the issuer make it liquid early.

---

## 7. Run it

**Prerequisites:** Node.js 20 or 22, npm 10+, `tmux` (for the one-command launcher), git.

### One command

```bash
npm install && (cd frontend && npm install)
npm run dev:tmux
```

`scripts/start-all.sh` then, in order: funds the platform broker and enforcer from the faucet and writes `.env` / `.enforcer.env` (plus 8 spare test accounts in `created_accounts.json` / `.txt`); runs the backend and frontend test suites; typechecks and builds; frees ports 8788, 8787, 5173; and opens a 2x2 `tmux` session named `at1`:

| Pane | Runs |
|---|---|
| 0 top-left | `npm run enforcer` (:8788) |
| 1 top-right | `ENFORCER_URL=http://localhost:8788 npm run serve` (:8787) |
| 2 bottom-left | frontend dev server (:5173) |
| 3 bottom-right | `scripts/show-accounts.ts`, live view of keys and balances |

```bash
tmux attach -t at1          # view; Ctrl+b then arrows / z (zoom) / d (detach); mouse is enabled
npm run stop:tmux           # stop everything
SKIP_FUND=1 npm run dev:tmux   # restart with the existing accounts, no faucet call
```

### Step by step

```bash
git clone git@github.com:G4SP4RDDB/AT1_XRPL.git && cd AT1_XRPL
npm install && (cd frontend && npm install)
cp .env.example .env && cp frontend/.env.example frontend/.env

npm run fund:setup          # broker + enforcer from the faucet -> .env / .enforcer.env, 8 spare accounts
npm run create-accounts 4   # optional: more funded test accounts to import into a wallet
npm run balances            # optional: check on-chain balances

npm test && (cd frontend && npm test && npm run typecheck && npm run build)

# three terminals
npm run enforcer                                   # 1: enforcer daemon, curl localhost:8788/health
ENFORCER_URL=http://localhost:8788 npm run serve   # 2: chain shim, prints the broker address
cd frontend && npm run dev                         # 3: http://localhost:5173
```

Multisig is not set up by any script: each issuer or investor activates it from the onboarding modal, signing with their own wallet.

> Caveat: this ledger is a custom network (NetworkID 4001) while WalletConnect's `xrpl:2` chain id denotes the public XRPL devnet, so a wallet that autofills and submits against its own nodes may refuse to sign for it (`request() chainId`). WalletConnect is nonetheless the single entry point, by product decision; see §12.

---

## 8. Using the app

1. **Connect** — *Connect Wallet* (top right) → scan the WalletConnect QR code (Xaman or any WalletConnect wallet). This is the only connection method, the platform broker included. First connection asks only whether you are an Issuer or an Investor; the profile later adds your institution name.
   Everyone can browse every screen; only the platform broker gets the *Broker Hub*. Actions are role-gated: only issuers can post a bond, only investors can fund one (`frontend/src/lib/roles.ts`).
2. **Issue (issuer)** — first click **Activer 2/2** on the Issue tab (your wallet signs `SignerListSet` + `AccountSet`; needed once, so the enforcer can co-sign your repayments), then post an ask with amount, ceiling annual yield and call date. The platform creates the vault and broker objects on the spot.
3. **Invest (investor)** — in *Finance Bonds*, click *Fund* on an open bond, enter an amount (the modal shows the remaining capacity from the live vault state); your wallet signs the `VaultDeposit` and you receive MPT shares. The deposit that fills the vault originates the loan automatically.
4. **Coupons and harvest** — the issuer pays coupons (`LoanPay`); PPS rises. Investors open *Withdraw*, choose **Yield-Only Partial** and confirm *Redeem Accrued Yield*: only the yield-equivalent shares are burned. The **Full Principal (Guardrail Test)** mode shows the on-ledger rejection while capital is on loan.
5. **Call date** — before it, an early payoff is refused by the enforcer and principal withdrawals fail on-ledger. At or after it, the issuer settles the remaining coupons; the loan closes, the vault is liquid, investors redeem principal plus yield.

---

## 9. Tests and verification

Four independent layers, all green. Summary with per-layer results: [`docs/test-verification-summary.md`](docs/test-verification-summary.md).

| Layer | Command | Covers |
|---|---|---|
| Backend unit tests (30) | `npm test` | Enforcer policy (full payment refused before the call date, exact coupon amounts, late payments), loan maths (rate scaling, call date derivation), yield share splitting, engine-code extraction, bid terms |
| Frontend unit tests (19) | `cd frontend && npm test` | Wallet context, xrpl config/client, app shell |
| On-chain end-to-end (17 steps) | `npm run e2e` | The full lifecycle of §6 against the live devnet, ~4–5 minutes (two real waits: a coupon going overdue and the call date). Rewrites `docs/e2e-full-report.md` with fresh hashes. |
| Frontend integration (17) | `cd frontend && npm run test:integration[:close]` | The same lifecycle through the browser's HTTP client against the running shim; `:close` includes settlement |

```text
✔ refuses anything that is not a LoanPay
✔ full payment is refused before the call date and allowed after
✔ on-time coupon must be exactly PeriodicPayment + LoanServiceFee
✔ callDateRipple does not drift as coupons are paid
✔ splitShares: a coupon raises PPS and a positive yield share count appears without any share burn
ℹ pass 29 | fail 0
```

---

## 10. Scripts reference

| Command | What it does |
|---|---|
| `npm run dev:tmux` / `npm run stop:tmux` | One-command launcher (§7) and its teardown |
| `npm run fund:setup` | Funds broker + enforcer from the faucet, writes `.env` / `.enforcer.env`, regenerates 8 spare test accounts (SQLite stays empty until accounts onboard) |
| `npm run create-accounts [N]` | Funds `N` fresh devnet accounts (1,000 XRP each) and prints addresses + seeds |
| `npm run enforcer` | Enforcer daemon on :8788 |
| `npm run serve` | Chain shim on :8787; `ENFORCER_URL` selects the daemon, otherwise the policy runs in-process for development. Never wipes local data. |
| `npm test` | Backend unit tests |
| `npm run e2e` | 17-step on-chain lifecycle, writes `docs/e2e-full-report.md` |
| `npm run check` | Devnet reachability and required amendments (`SingleAssetVault`, `LendingProtocol`, `fixCleanup3_4_0`, …) |
| `npm run balances` / `npm run all-balances` | On-chain balances of configured accounts / full liquid-vs-reserved report |
| `npm run vaults` / `npm run objects` | Scan vaults (PPS, loans, call dates) / raw ledger objects |
| `npm run show:accounts` | Formatted view of platform keys, registered accounts, balances |
| `npm run spike` / `npm run demo` | The original lifecycle spike and demo flow (historical, see `docs/spike-results.md`) |
| `npm run fund` | **Legacy**: funds one account per role and writes `BORROWER_SEED`, `LENDER1_SEED`, … into `.env`, which `loadAccounts()` still honours as overrides for scripts. Prefer `fund:setup`. |
| `cd frontend && npm run dev / build / typecheck / test / test:integration` | Frontend dev server, production bundle, `tsc -b`, Vitest unit and integration suites |

---

## 11. Environment and network

| Parameter | Value |
|---|---|
| Track | 1, open-ended Single Asset Vault, Lending Protocol V1 |
| Network | Custom Hackathon Devnet, `rippled 3.4.0-rc1`, amendments `SingleAssetVault`, `LendingProtocol`, `LendingProtocolV1_1`, `fixCleanup3_4_0`, `TokenEscrow`, `PermissionedDomains`, `Credentials`, `MPTokensV1` |
| Reserves | 10 XRP base + 2 XRP per object |
| WSS / RPC | `wss://lending-hackathon.dev.ripplex.io:51233` / `https://lending-hackathon.dev.ripplex.io:51234` |
| Explorer | https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/ |
| Faucet | https://lending-hackathon-faucet.dev.ripplex.io/accounts (1,000 XRP, port 443) |
| Library | `xrpl.js 5.2.0` (stable), `xrpl-connect 0.8.2` |

Environment files (all gitignored): `.env` (`BROKER_SEED`, `BROKERENFORCER_SEED`, optional `XRPL_WSS` / `XRPL_RPC` / `XRPL_FAUCET` / `XRPL_EXPLORER` overrides), `.enforcer.env` (`BROKER_ADDRESS`, `ENFORCER_SEED`), `frontend/.env` (`VITE_XRPL_*` endpoints, `VITE_CHAIN_URL`). Templates: `.env.example`, `frontend/.env.example`.

> Some venue networks drop TLS on ports 51233/51234 while 443 works. The browser only talks to the shim, so the UI works anywhere; the machine running the shim needs a network that reaches the ledger ports. See `docs/friction-log.md` #4.

---

## 12. Known limitations

- **No native time condition on multisig.** The call-date rule is enforced by the daemon's policy, not by the ledger (§3). Proposed fixes in the feedback report: `SignAfter` on `SignerEntry`, or a `TokenEscrow` composition.
- **Operator keys are backend-held** because no wallet adapter can produce multisig or `LoanSet` counterparty signatures (§4).
- **WalletConnect on a custom network.** WalletConnect identifies XRPL networks by CAIP id (`xrpl:0/1/2`); this devnet is NetworkID 4001, so the app has to pick a chain the wallet approved and encode the signed transaction itself (`signPrepared`). It works, but every signature is a phone round trip, the session does not survive a reload, and Xaman cannot show this network's balances: fine for the demo, slow for development.
- **Discovery and funding windows are off-chain.** An ask is a vault plus off-chain metadata; its funding window has no on-chain effect (a background scan settles stalled bonds at the deadline). We built a bid / accept / decline layer and removed it: nothing on the ledger can reserve an investor's funds against an ask, so a "locked" bid was only a database row (`TokenEscrow` would make it real).
- **No native "this vault lends only to X".** Neither `VaultCreate` nor `LoanBrokerSet` can restrict the loan counterparty; we record the issuer in the vault's `Data` and enforce it in the shim and the enforcer. A `LoanBrokerSet.AllowedCounterparty` (or a Credential requirement on borrowers) would make it a ledger rule.
- **Amortising only.** XLS-66 has no interest-only / bullet schedule: every instalment repays a slice of principal, so a "coupon" here is principal + interest, unlike a real AT1 whose coupons are interest-only with principal at the call.
- **Write-down, not conversion.** XLS-66 supports impairment, not converting debt to equity.
- **No oracle-driven trigger.** A CET1-style trigger would need an off-chain oracle; impairment is triggered manually by the broker.
- **Whitelists are asymmetric.** Depositors can be gated natively (`VaultCreate` `tfVaultPrivate` + `DomainID`, Credentials), which is how an accredited-investor / minimum-ticket rule would be expressed; we did not build it. Borrowers cannot: `LoanBrokerSet` has no `DomainID`, and the depositor gate does not apply to `VaultWithdraw`.

---

## 13. Deliverables and documentation index

**Hackathon deliverables**

| Deliverable | Where |
|---|---|
| Developer feedback report (max 3 pages, 40 % of the score) | [`FEEDBACK_REPORT.md`](FEEDBACK_REPORT.md) |
| Slide deck (10 slides, 4-minute demo + 2-minute Q&A) | [`slides/BSA_DEGEN_AT1_XRPL_PITCH.md`](slides/BSA_DEGEN_AT1_XRPL_PITCH.md) |
| Verified on-chain transactions | §6 above (17 steps, 13 hashes), [`docs/e2e-full-report.md`](docs/e2e-full-report.md) |
| Raw friction log (32 entries: category, repro, severity, library version, proposed fix) | [`docs/friction-log.md`](docs/friction-log.md) |
| Full analysis compendium (architecture evolution, Track 1 vs 2, custody decisions, every friction with repro) | [`docs/comprehensive-analysis-and-feedback.md`](docs/comprehensive-analysis-and-feedback.md) |
| DevEx hook | `xrpl-devex-hook/` installed and active on every developer machine |

**Technical documentation**

| File | What's in it |
|---|---|
| [`docs/chain-api.md`](docs/chain-api.md) | The chain shim's HTTP contract: every `read.*` / `tx.*` / `profile.*` / `book.*` function, shapes, result codes, the enforcer policy |
| [`docs/borrower-lender-custody.md`](docs/borrower-lender-custody.md) | Why issuers/investors are independent wallets, and the two wallet-tooling gaps that keep one co-signing key backend-held |
| [`docs/bank-profiles-and-order-book.md`](docs/bank-profiles-and-order-book.md) | Design record of the tranche order book (Morpho / Hyperliquid / Tenor-inspired) and the bank-profile store. **Both were removed on 13 September**: funding is a direct deposit from the bond list, names come from the onboarding institution. Kept for the reasoning and the friction it surfaced (#31) |
| [`docs/tech-stack.md`](docs/tech-stack.md) | Stack rationale, zero-custody boundaries, security model |
| [`docs/frontend-integration.md`](docs/frontend-integration.md) | Call sequence per screen, with real devnet response samples |
| [`frontend/README.md`](frontend/README.md) | Frontend layout, scripts, tests |

**Verification reports**

| File | What's in it |
|---|---|
| [`docs/test-verification-summary.md`](docs/test-verification-summary.md) | Four-layer verification summary for a full pipeline run |
| [`docs/e2e-full-report.md`](docs/e2e-full-report.md) | The 17-step on-chain run, every hash |
| [`docs/spike-results.md`](docs/spike-results.md) | Raw output of the first lifecycle spikes, including the early-close measurement |

**Planning and event material** (historical / reference, not deliverables)

| File | What's in it |
|---|---|
| [`docs/dev-pipeline.md`](docs/dev-pipeline.md), [`docs/plan-foundations.md`](docs/plan-foundations.md) | The original build plan and its first subplan |
| [`two_person_split.md`](two_person_split.md) | The layer-based split that kept two people off the same files |
| [`xrpl_lending_slides.md`](xrpl_lending_slides.md), [`slides/XRPL Lending Protocol Hackathon Challenge.md`](<slides/XRPL Lending Protocol Hackathon Challenge.md>), [`slides/XRPL Workshop - Lending Protocol Hackathon.md`](<slides/XRPL Workshop - Lending Protocol Hackathon.md>), [`slides/final lending intro.md`](<slides/final lending intro.md>) | Organizer decks, transcribed |

**Repository layout**

```text
src/chain/        ledger execution: ops.ts (transaction builders), readLayer.ts (PPS / yield maths),
                  accounts.ts, server.ts (:8787), enforcer/ (policy + daemon :8788)
src/db/           SQLite participant registry
shared/           types.ts and chainClient.ts, the contract between frontend and chain layer
frontend/         Vite + React 19 app; integration/ holds the live-devnet suite
scripts/          setup, diagnostics, e2e and demo runners
tests/            backend unit tests
docs/, slides/    documentation and the pitch deck
```
