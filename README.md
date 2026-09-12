# AT1 Bond Issuance & Marketplace on XRPL (XLS-65 / XLS-66)

> **XRPL Lending Protocol Hackathon 2026** — Track 1 (Open-ended Vault + Lending Protocol V1)  
> **Team**: BSA Degen | **Flavour**: Loaded (XLS-65 / XLS-66 + XRPL Native Multisig + MPT)

An on-chain Additional Tier 1 (AT1) bond issuance and investment platform built natively on the XRP Ledger using **XLS-65 (Single Asset Vault)** and **XLS-66 (Lending Protocol V1)**.

---

## 1. Executive Summary

In traditional finance, **Additional Tier 1 (AT1)** contingent convertible bonds are perpetual subordinated debt instruments designed to absorb losses while paying high, periodic coupon yields. They feature a fixed **Call Date** at which the issuer can redeem the principal, but investors cannot withdraw their principal before that date.

This platform implements AT1 bonds natively on XRPL:
- **1 Bond = 1 Open-Ended Vault (`VaultCreate`)**: Automatically spawned when a corporate borrower publishes a debt bid.
- **Indicative Matching Layer**: An off-chain frontend order-matching board allowing lenders to discover bids and align terms before committing capital.
- **Continuous Yield Accrual & On-Demand Withdrawal**: Borrower coupon payments (`LoanPay`) increase the vault's **Price Per Share (PPS = AssetsTotal / SharesTotal)**. Depositors can withdraw their accrued yield anytime via a partial `VaultWithdraw`, without touching their locked principal.
- **Call-Date Lock via Multisig**: The principal remains illiquid while out on loan. Early loan payoff is strictly blocked by an on-chain **2-of-2 Multisig gate** (`SignerListSet` + `asfDisableMaster`), with an autonomous **Enforcer Daemon** that only signs the final loan clearance transaction at or after the agreed Call Date.

---

## 2. Track & Environment Configuration

| Parameter | Specification |
|---|---|
| **Hackathon Track** | **Track 1: Open-ended Single Asset Vault** |
| **Protocol Standards** | **XLS-65** (Single Asset Vault) & **XLS-66** (Lending Protocol V1) |
| **Flavour** | **Loaded** (Core XLS-65/66 + Native 2-of-2 Multisig Enforcer + MPT) |
| **Network** | **Custom Hackathon Devnet** (`rippled 3.4.0-rc1` with `fixCleanup3_4_0`) |
| **Client Library** | `xrpl.js` (Stable `^5.2.0`) |
| **WebSocket (WSS)** | `wss://lending-hackathon.dev.ripplex.io:51233` |
| **JSON-RPC** | `https://lending-hackathon.dev.ripplex.io:51234` |
| **Explorer** | [https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/) |
| **Faucet** | [https://lending-hackathon-faucet.dev.ripplex.io/accounts](https://lending-hackathon-faucet.dev.ripplex.io/accounts) |

---

## 3. Architecture Décentralisée & Gestion des Comptes (Zero-Custody)

### 3.1 Le Broker : Seul Compte Connu et Détenu par le Backend à sa Création
Dans une véritable architecture financière institutionnelle sur XRPL, **le backend EST le service de courtage (le *Loan Broker*)**. Il ne doit ni connaître à l'avance, ni stocker en dur dans ses fichiers de configuration les clés privées des emprunteurs ou des investisseurs.

- **Fichier de configuration `.env`** : contient **strictement et uniquement** l'identité du Broker et de son Enforcer multisig :
  ```env
  BROKER_SEED=sEdS2MKfSFCY9GZetLdhTUdRA9NKmyj
  BROKERENFORCER_SEED=sEdVrSbV9bTcZrjWvYMvQeHt96knMge
  ```
- **Rôle du Broker** : Crée le coffre-fort d'émission (`VaultCreate`), structure les conditions de prêt (`LoanBrokerSet`), dépose le capital de couverture de première perte (*First-Loss Capital* via `LoanBrokerCoverDeposit`), et gère l'absorption des pertes en cas de défaut (`LoanManage tfLoanImpair`).

### 3.2 Base de Données SQLite des Clients (`data/accounts.db`)
Tous les emprunteurs et investisseurs sont créés dynamiquement ou connectés via leur wallet. Pour l'environnement Devnet, le backend intègre une base de données **SQLite locale** (`src/db/index.ts` via `better-sqlite3`) qui gère les participants :

| Champ | Type | Description |
|---|---|---|
| `address` | `TEXT PRIMARY KEY` | Adresse XRPL classic (`r...`) du compte client. |
| `role` | `TEXT` | Rôle du client : `'borrower'` ou `'lender'`. |
| `name` | `TEXT` | Nom d'affichage complet du compte. |
| `seed` | `TEXT` | Clé secrète de test sur le Devnet (générée par le faucet). |
| `firstName` | `TEXT` | Prénom du représentant (ex: *Alexandre*, *Sophie*). |
| `userRole` | `TEXT` | Titre du représentant (ex: *Directeur Financier (CFO)*, *Portfolio Manager*). |
| `company` | `TEXT` | Entité morale (ex: *AT1 Corporate Issuer SA*, *Alpha Asset Management*). |
| `operatorAddress` | `TEXT` | Adresse de la clé signataire opérateur (`borrowerOp`) dédiée à cet emprunteur. |
| `operatorSeed` | `TEXT` | Clé secrète de l'opérateur pour signer les remboursements. |
| `multisigActive` | `INTEGER` | `1` si le multisig 2-of-2 et `asfDisableMaster` sont activés on-chain, sinon `0`. |
| `createdAt` | `TEXT` | Horodatage ISO de création du compte. |

### 3.3 Pourquoi Distinguer le Compte Emprunteur (`borrower`) et son Opérateur (`borrowerOp`) ?
Une question architecturale fréquente sur XRPL : *Pourquoi l'emprunteur ne peut-il pas signer avec sa propre clé ?*

1. **Règle protocolaire XRPL (`SignerListSet`)** : Le protocole interdit formellement qu'un compte figure dans sa propre liste de signataires :
   $$\text{SignerEntry.Account} \neq \text{Account}$$
   Si un compte s'inscrit lui-même, la transaction échoue avec l'erreur `temBAD_SIGNER`.
2. **Désactivation de la clé maître (`asfDisableMaster: 4`)** : Pour garantir aux investisseurs que l'emprunteur ne remboursera pas par surprise avant la date de Call, sa clé maître est désactivée. Le compte `borrower` ne peut donc plus rien signer directement (`tefMASTER_DISABLED`).
3. **Séparation des pouvoirs** :
   - **`borrower`** = Le compte entité / trésorerie de l'entreprise (détient la dette et reçoit les fonds du prêt).
   - **`borrowerOp`** = La clé physique du Directeur Financier (Signataire #1).
   - **`brokerEnforcer`** = La clé fiduciaire de la plateforme (Signataire #2, vérifie la Call Date).
   Chaque emprunteur enregistré dans la base de données dispose ainsi de **sa propre paire de clés opérateur dédiée**, évitant tout partage de clés entre plusieurs emprunteurs.

### 3.4 Sécurité Zéro-Humain de l'Enforcer (Signature 2 du Multisig)
Une exigence fondamentale de l'obligation AT1 est que **le verrou de maturité (Call Date) ne doit dépendre d'aucune discrétion humaine** :
- **Clé 100% logicielle** : La clé privée du signataire enforcer (`ENFORCER_SEED` dans `.enforcer.env`, permissions `0600`) est détenue et manipulée **exclusivement par le daemon logiciel autonome** (`src/chain/enforcer/server.ts`, port 8788).
- **Zéro accès humain** : Aucun humain (ni l'emprunteur, ni le broker, ni un administrateur) ne peut ordonner une signature manuelle ou extraire la clé. La clé n'est jamais affichée dans la console, jamais exposée dans le frontend, et aucun endpoint de signature arbitraire n'existe.
- **Politique de co-signature immuable** : Le daemon n'expose qu'une route `POST /cosign` qui applique une politique algorithmique stricte :
  1. Vérifie que la transaction est un `LoanPay` pour un prêt supervisé par ce protocole.
  2. Interroge le temps de fermeture officiel du ledger validé (`ledgerCloseTime`).
  3. Si la transaction comporte le flag de remboursement intégral (`tfLoanFullPayment`) alors que la date de Call n'est pas atteinte (`now < callDateRipple`), **le daemon refuse formellement de signer** (`blocked:before-call-date`). La clé privée n'est jamais chargée ni utilisée.
  4. La co-signature n'est produite que lorsque la preuve on-chain de l'échéance temporelle est satisfaite.
- **En production (Loaded Primitive)** : Dans un déploiement institutionnel, ce daemon est déployé dans une enclave matérielle confidentielle (**AWS Nitro Enclaves, HSM ou TEE**), rendant l'extraction de clé ou le forçage de signature cryptographiquement impossible même avec un accès `root` au serveur.

### 3.5 Onboarding Interactif & Activation du Multisig à la Demande
Le multisig n'est plus automatisé en arrière-plan à la création :
- Lorsque le Directeur Financier se connecte sur l'interface, il ouvre la modale de profil : il renseigne son prénom, son rôle et sa société.
- Il clique sur **"Enregistrer & Activer le Multisig"** : la transaction `SignerListSet` (Quorum 2) et `AccountSet` (`asfDisableMaster`) est soumise on-chain.
- Une notification toast s'affiche avec le hash validé de la transaction, et un badge `2/2 MULTISIG` apparaît sur son profil dans la barre de navigation.

### 3.6 Comment Fonctionne la Liquidation & l'Absorption de Pertes (Write-Down)
Sous XLS-66, si un emprunteur n'honore pas un paiement de coupon à échéance (`now > NextPaymentDueDate`), le Broker peut absorber la perte via son capital de première perte :
- **Transaction** : `LoanManage` avec le flag `tfLoanImpair` (`0x00020000`).
- **Autorisation** : Signé exclusivement par le **Broker** (`BROKER_SEED` dans `.env`).
- **Déclenchement API** : `POST http://localhost:8787/tx/impair` avec `{ "args": ["<LOAN_ID_HEX>"] }`.

---

## 4. XLS-65 & XLS-66 Transactions Used

| Transaction | Protocol | Role / Description |
|---|---|---|
| `VaultCreate` | **XLS-65** | Creates an open-ended Single Asset Vault for each bond issuance upon borrower bid creation. |
| `LoanBrokerSet` | **XLS-66** | Configures loan broker parameters, interest rate bounds, platform fees, and first-loss capital buffer (`CoverAvailable`). |
| `LoanBrokerCoverDeposit` | **XLS-66** | Broker deposits first-loss absorption capital into the broker risk buffer. |
| `VaultDeposit` | **XLS-65** | Investors deposit XRP into the bond vault, minting MPT vault shares proportional to the current Price Per Share. |
| `LoanSet` | **XLS-66** | Originates and atomically disburses principal with mutual broker and borrower approval (Note: no separate `LoanDraw` exists in XLS-66). |
| `LoanPay` | **XLS-66** | Periodic coupon repayments by the borrower to increase vault assets and PPS; final payoff is multisig-gated. |
| `LoanManage` | **XLS-66** | Broker triggers loss absorption write-down (`tfLoanImpair`) or restores loan health (`tfLoanUnimpair`). |
| `VaultWithdraw` | **XLS-65** | Partial share redemption to withdraw accrued yield, or full redemption after Call Date loan clearance. |
| `SignerListSet` | **Core XRPL** | Establishes the 2-of-2 multisig rule on the borrower account (`BorrowerOp` + `Platform Enforcer`) with master key disabled (`asfDisableMaster`). |
| `AccountSet` | **Core XRPL** | Disables the borrower's master key (`asfDisableMaster`) to enforce multisig co-signature compliance. |

---

## 5. Verified On-Chain Transactions (Deliverable Proof)

Every phase of the AT1 bond lifecycle has been executed and verified on the **Custom Hackathon Devnet** (`lending-hackathon.dev.ripplex.io:51233`), covering happy paths, protocol guardrail rejections, multisig enforcement, and write-down / impairment:

> **Reproducibility**: Run `npm run e2e` to re-execute all 16 on-chain steps against Devnet (report generated in [`docs/e2e-full-report.md`](docs/e2e-full-report.md)).

| # | Step / Mechanism | Expected Result | Devnet Status | Verified On-Chain Explorer Link |
|---|---|---|---|---|
| **1** | `VaultCreate` (Open-ended SAV) | `tesSUCCESS` | ✅ `tesSUCCESS` | [`C8B24C23A2...`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C8B24C23A2D0499ACE61281E97DCCBC288BFC7711DCBA721CB9DBC60E591A9CC) |
| **2** | `LoanBrokerSet` (Rates & Fees) | `tesSUCCESS` | ✅ `tesSUCCESS` | [`C093128A26...`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C093128A266EE66091CFF3EEEBCB170175221DCDC6C095DDA656E85AE8960C6B) |
| **3** | `LoanBrokerCoverDeposit` (First-loss buffer) | `tesSUCCESS` | ✅ `tesSUCCESS` | [`CCEA07B7C4...`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/CCEA07B7C4387ECD4666476E8C22952F73ABE2F0F49952F832EFA363452CE429) |
| **4** | `VaultDeposit` (Lender capital -> MPT shares) | `tesSUCCESS` | ✅ `tesSUCCESS` | [`BA2C86E975...`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/BA2C86E975C6B07349215D05FA39E58BEE9BEDAB7261F7A31DC79E438F3E9177) |
| **5** | Master Key Disabled Check (`asfDisableMaster`) | `tefMASTER_DISABLED` | 🛡️ `tefMASTER_DISABLED` | Native Ledger Rejection (Master key disabled) |
| **6** | `LoanSet` (2-of-2 Multisig Counterparty Approval) | `tesSUCCESS` | ✅ `tesSUCCESS` | [`23AA66A740...`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/23AA66A74042F4C4EC5A3ABDCACA90B9CD4715D371A01031D2DD186DDDD17ED8) |
| **7** | Guardrail: `LoanManage tfLoanImpair` (Not yet due) | `tecTOO_SOON` | 🛡️ `tecTOO_SOON` | [`34AE03134F...`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/34AE03134F37ACF3C3B87AB0A5941E1AE755933662E07153F7B6FEE01CE7C13C) |
| **8** | Guardrail: Full `VaultWithdraw` while capital on loan | `tecINSUFFICIENT_FUNDS` | 🛡️ `tecINSUFFICIENT_FUNDS` | [`C4240633AC...`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C4240633AC9E52509C00370466BE8838F05B53F7DA28B61BC31D4FBA4016C1AF) |
| **9** | Enforcer Policy: Early repayment refusal before Call Date | `blocked:before-call-date` | 🛡️ Blocked | Autonomous Enforcer Daemon policy gate |
| **10** | Quorum Guardrail: `LoanPay` with 1 of 2 signatures | `tefBAD_QUORUM` | 🛡️ `tefBAD_QUORUM` | Native Ledger Rejection (Multisig threshold 2 not met) |
| **11** | Loss Absorption: `LoanManage tfLoanImpair` (Overdue) | `tesSUCCESS` | ✅ `tesSUCCESS` | [`7978F00413...`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/7978F00413D38372CB2757B46CB31A41D336A186B2297C9B907E8AC11BBD83B5) |
| **12** | Debt Restoration: `LoanManage tfLoanUnimpair` | `tesSUCCESS` | ✅ `tesSUCCESS` | [`8BB3ECA9B9...`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/8BB3ECA9B954F13AFE386ECD03954E91397016236203D6EC4E83654D9C13E4A1) |
| **13** | Periodic Coupon: `LoanPay` (Increases PPS) | `tesSUCCESS` | ✅ `tesSUCCESS` | [`5F2A407308...`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/5F2A4073080377786571A24CD2AD0B5DE334BB008871C477FDD998EE0B1211B6) |
| **14** | `VaultWithdraw` (Yield-only partial harvest) | `tesSUCCESS` | ✅ `tesSUCCESS` | [`0224724B4D...`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/0224724B4DA69A92D01D1EDA54FD13DB1D7D79520407E706C039F195E760D234) |
| **15** | Final Payoff at Call Date (`tfLoanFullPayment`) | `tesSUCCESS` | ✅ `tesSUCCESS` | [`EA805215F3...`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/EA805215F309CCC1F22A209B3B01328E351BE9EB1F73B5F90447E816D947994E) |
| **16** | Final Full `VaultWithdraw` (Principal + Yield) | `tesSUCCESS` | ✅ `tesSUCCESS` | [`99A7BB682D...`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/99A7BB682D4A772B4A2F8FF461E556DE8D8EC4A33BBED51E5EA56BF76024A7BF) |

---

## 6. Architecture Overview

```mermaid
flowchart TD
    subgraph UI ["Frontend (Client Layer — Port 5173)"]
        React["React 19 + TypeScript + Vite"]
        XRPLConnect["xrpl-connect (Xaman / Crossmark)"]
        DbSelector["Comptes en Base SQLite & Faucet Devnet"]
        MatchBoard["Indicative Bid / Ask Matching Board"]
        Dashboard["AT1 Vault & Yield Dashboard"]
    end

    subgraph Middleware ["Backend & Settlement Services"]
        ChainShim["Chain Shim Service (:8787)\nsrc/chain/server.ts"]
        Enforcer["Autonomous Multisig Enforcer (:8788)\nsrc/chain/enforcer/server.ts"]
        ReadLayer["Stateless Ledger Read Layer\nsrc/chain/readLayer.ts"]
        SQLiteDB[("SQLite Database\ndata/accounts.db\nsrc/db/index.ts")]
    end

    subgraph Ledger ["XRPL Custom Hackathon Devnet"]
        Vault["XLS-65 Single Asset Vault (SAV)"]
        Lending["XLS-66 Lending Protocol V1"]
        Multisig["2-of-2 Multisig (Call-Date Lock)"]
        MPT["MPT Vault Shares"]
    end

    UI -->|JSON-over-HTTP| ChainShim
    ChainShim --> ReadLayer
    ChainShim --> SQLiteDB
    ChainShim -->|Verify & Sign LoanPay| Enforcer
    ReadLayer -->|Read Ledger State| Ledger
    ChainShim -->|Submit Transactions| Ledger
    Enforcer -->|Co-signs LoanPay| Multisig
```

### Services Breakdown

1. **Frontend (`frontend/`, Port 5173)** :
   - Interface institutionnelle temps-réel avec toasts de confirmation de transactions (hash, statut ledger, liens explorer).
   - Sélecteur de compte multi-rôles : sélection en 1 clic parmi les comptes en base SQLite, création instantanée via faucet Devnet, ou WalletConnect.
   - Calcul dynamique du Price Per Share (PPS) et retrait partiel de yield sans toucher au principal.
2. **Chain Shim (`src/chain/server.ts`, Port 8787)** :
   - API JSON-over-HTTP exposant les méthodes typées `read` et `tx`.
   - Ne charge que `BROKER_SEED` depuis `.env`. Résout dynamiquement les signataires emprunteurs et prêteurs depuis la base SQLite.
3. **Multisig Enforcer Daemon (`src/chain/enforcer/server.ts`, Port 8788)** :
   - Microservice autonome détenant la clé Enforcer (`.enforcer.env`).
   - Vérifie l'heure de clôture du ledger et bloque strictement tout remboursement anticipé avant la date de Call convenue.
4. **Base de Données Clients SQLite (`data/accounts.db`, `src/db/index.ts`)** :
   - Maintient l'annuaire des emprunteurs et investisseurs, leurs profils (CFO, société) et leurs paires de clés opérateur dédiées (`borrowerOp`).

---

## 7. Installation & Setup Guide

### Prerequisites
- **Node.js**: `v20.x` or `v22.x`
- **npm**: `v10.x` or higher
- **tmux**: Installed (`sudo apt install tmux` on Ubuntu/Debian)
- Git with SSH key configured

---

### Method 1: The Automated Pipeline (Recommended) 🚀

This single command executes the complete end-to-end launch pipeline in **5 automated steps**:

```bash
npm run dev:tmux
```

#### What happens under the hood:
1. **⚡ Broker Generation & DB Initialization** (`scripts/fund-and-setup.ts`):
   - Finance le Platform Broker et son Enforcer sur le Devnet (1 000 XRP chacun).
   - Écrit `.env` contenant **exclusivement** `BROKER_SEED` et `BROKERENFORCER_SEED` (aucune clé client).
   - Initialise la base de données SQLite locale (`data/accounts.db`) avec les profils emprunteur et prêteurs de démonstration.
2. **🧪 Test Suite**: Exécute les 24 tests backend unitaires et les 19 tests frontend Vitest (100% passants).
3. **⚙️ Compilation & Typecheck**: Compile TypeScript (`tsc --noEmit`) et génère le bundle de production Vite.
4. **🧹 Port Cleanup**: Libère automatiquement les ports 8788, 8787 et 5173.
5. **🖥️ Split-Screen tmux (Grille 2x2 — 4 Volets)**: Lance la session `at1` avec les 4 volets synchronisés :
   - **Volet 0 (Haut-Gauche)** : `🛡️ 1. Multisig Enforcer` (`:8788`)
   - **Volet 1 (Haut-Droit)** : `🔗 2. Chain Shim API` (`:8787`)
   - **Volet 2 (Bas-Gauche)** : `💻 3. Frontend Dev Server` (`:5173`)
   - **Volet 3 (Bas-Droit)** : `💎 4. Account Seeds & Credentials` (Affichage en direct des clés et de la base SQLite).

#### Managing the tmux session:
```bash
# Attach and view the 4-pane dashboard:
tmux attach -t at1

# Useful shortcuts inside tmux:
# - Click on any pane with your mouse (mouse support is enabled)
# - Ctrl+b then arrow keys : navigate between panes
# - Ctrl+b then z          : toggle fullscreen zoom on the active pane
# - Ctrl+b then d          : detach from tmux (services remain running)

# Stop all 3 services and kill the session cleanly:
npm run stop:tmux
```

> **Tip**: If you want to restart the services with your **existing accounts** without re-funding from the faucet, simply run:
> ```bash
> SKIP_FUND=1 npm run dev:tmux
> ```

---

### Method 2: Step-by-Step Manual Setup (Terminal by Terminal) 🛠️

For developers who prefer manual control over each individual service:

#### Step 1: Clone and Install Dependencies
```bash
# Clone the repository
git clone git@github.com:G4SP4RDDB/AT1_XRPL.git
cd AT1_XRPL

# Install root & backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

#### Step 2: Configure Environment Files
```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

#### Step 3: Fund Accounts & Configure On-Chain Multisig
Generate fresh roles from the Devnet faucet, populate `.env` / `.enforcer.env`, and submit the multisig configuration:
```bash
npm run fund:setup
```

*(Optional: To create additional throwaway funded test accounts at any time:)*
```bash
npm run create-accounts 4
```

To verify on-chain balances across all configured accounts:
```bash
npm run balances
```

#### Step 4: Run Tests & Compile Codebase
```bash
# Run backend test suite (24 tests)
npm test

# Run frontend tests & strict typecheck
cd frontend
npm test
npm run typecheck
npm run build
cd ..
```

#### Step 5: Start the 3 Services in Separate Terminals

- **Terminal 1 — Autonomous Multisig Enforcer (Port 8788)**:
  ```bash
  npm run enforcer
  ```
  *(Healthcheck: `curl http://localhost:8788/health`)*

- **Terminal 2 — Chain Shim Service (Port 8787)**:
  ```bash
  ENFORCER_URL=http://localhost:8788 npm run serve
  ```
  *(Prints the Platform Broker Address banner on startup)*

- **Terminal 3 — Frontend Web Application (Port 5173)**:
  ```bash
  cd frontend
  npm run dev
  ```

#### Step 6: Access the Application
Open your browser at **[http://localhost:5173](http://localhost:5173)**.

---

## 8. Connecting Your Wallet & User Flow

1. **Connect Wallet**:
   - Click **Connect Wallet** in the top-right corner.
   - Connect via your XRPL wallet (Xaman / Crossmark / GemWallet) using the native `xrpl-connect` WalletConnect URI or QR code.
2. **Borrower Flow (Issuance)**:
   - Submit a **Debt Bid** specifying the principal amount, offered annual yield, and Call Date.
   - The platform automatically deploys an on-chain **Single Asset Vault** (`VaultCreate`) and configures the **Loan Broker** (`LoanBrokerSet`).
3. **Lender Flow (Investment)**:
   - Submit an indicative **Ask** to signal liquidity demand.
   - Click **Deposit** on a matched bid: your funds are deposited into the vault (`VaultDeposit`) and you receive MPT vault shares.
4. **Coupon Distribution & Yield Harvest**:
   - The borrower pays periodic interest coupons via `LoanPay`.
   - Each payment increases the vault's total assets and share price (PPS).
   - Lenders can click **Claim Accrued Yield** (`VaultWithdraw`), burning only the yield-equivalent shares while leaving their principal locked in the vault.
5. **Call Date & Principal Redemption**:
   - Prior to Call Date: Attempting to fully redeem principal triggers the protocol's native **"insufficient liquidity" guardrail** (capital is out on loan). Early full loan repayment is blocked by the Enforcer.
   - On/After Call Date: The borrower initiates final loan repayment; the Enforcer approves and co-signs the transaction. Once repaid, capital becomes liquid in the vault and lenders can withdraw their full principal.

---

## 9. Verification & Test Suite

### Backend Unit Tests (24 Passing Tests)

Verifies interest scaling, enforcer policy, early repayment refusal, share splitting, and error code extraction:

```bash
npm test
```

```text
✔ refuses anything that is not a LoanPay
✔ refuses loans brokered by someone else, or unknown loans
✔ on-time coupon must be exactly PeriodicPayment + LoanServiceFee
✔ full payment is refused before the call date and allowed after
✔ callDateRipple does not drift as coupons are paid
✔ periodicRate scales an annual 1/10 bp rate to one interval
✔ splitShares: a coupon raises PPS and positive yield shares appear
...
ℹ pass 24 | fail 0
```

### On-Chain End-to-End Devnet Verification (16/16 Steps)

Executes the complete bond lifecycle against the live Custom Hackathon Devnet, asserting ledger states, guardrails, and yield mathematics:

```bash
npm run e2e
```

Generates the audit report at [`docs/e2e-full-report.md`](docs/e2e-full-report.md) with verified transaction hashes on the custom explorer.

### Frontend Typechecking, Tests & Build

```bash
cd frontend
npm run typecheck       # Strict TypeScript check (tsc -b)
npm test                # Vitest unit test suite (19 tests)
npm run build           # Production bundle via Vite / Rolldown
```

---

## 10. Key Developer Feedback & Findings

As part of the hackathon evaluation criteria (**40% Developer Feedback Quality**), 14 detailed real-world friction points encountered with XLS-65/66, along with repros, severities, and concrete protocol improvement proposals, are documented in:
- [`docs/friction-log.md`](docs/friction-log.md): Comprehensive developer friction log & protocol proposals.
- [`docs/tech-stack.md`](docs/tech-stack.md): Architectural design rationale and boundary separation.
- [`docs/e2e-full-report.md`](docs/e2e-full-report.md): Verified on-chain ledger test execution report.

### Headline Finding: The Multisig Timing Gap
While XLS-65 prevents premature principal redemption via native liquidity guardrails while capital is out on loan, XRPL currently lacks an on-chain time-locked repayment primitive to stop a borrower from clearing a loan prematurely. We resolved this through a **2-of-2 multisig schedule enforcer**, and propose hardening it via **TokenEscrow (`FinishAfter`)** as a native XLS-85 composition.

---

## 11. Available Scripts & Cheatsheet

| Command | Description |
|---|---|
| `npm run dev:tmux` | **All-in-One Launcher**: Generates accounts, executes full test suite, compiles TS/Vite, frees ports, and launches Enforcer (`:8788`), Shim (`:8787`), Frontend (`:5173`), and Live Credentials Viewer in a 4-pane tmux session (2x2 grid). |
| `npm run stop:tmux` | Gracefully stops the `at1` tmux session and frees ports 8788, 8787, and 5173. |
| `npm test` | Runs the 24 backend unit tests (math, policy, enforcer, share split). |
| `npm run e2e` | Runs the 16-step on-chain end-to-end bond lifecycle against Devnet (vault creation, multisig, guardrails, impairment, coupon harvest, call date repayment) and writes `docs/e2e-full-report.md`. |
| `npm run check` | Validates Devnet WSS connectivity and checks required protocol amendments (`SingleAssetVault`, `LendingProtocol`, `fixCleanup3_4_0`, etc.). |
| `npm run balances` | Queries on-chain XRP balances and sequence numbers for all configured roles. |
| `npm run all-balances` | Full diagnostic report of liquid and reserved XRP balances across all accounts. |
| `npm run vaults` | Scans on-chain vaults, Price Per Share (PPS), outstanding loans, and call dates. |
| `npm run create-accounts [N]` | Generates and funds `N` fresh Devnet accounts (1,000 XRP each) and outputs their addresses & seeds. |
| `npm run fund` | Automatically funds and populates root `.env` demo seeds from the Devnet faucet. |
| `npm run fund:setup` | Generates fresh accounts, updates `.env` & `.enforcer.env`, and configures borrower multisig on-chain. |
| `npm run show:accounts` | Displays a formatted summary of all active roles, addresses, seeds, and verified XRP balances. |
| `npm run enforcer` | Starts the standalone Multisig Call-Date Enforcer daemon on port `8788`. |
| `npm run serve` | Starts the Chain Shim JSON-over-HTTP API bridge on port `8787`. |
| `cd frontend && npm test` | Runs the Vitest frontend unit test suite (19 tests). |
| `cd frontend && npm run typecheck` | Strict TypeScript check (`tsc -b`) for the frontend. |
| `cd frontend && npm run build` | Compiles the production bundle via Vite & Rolldown. |

---

## 12. Repository Structure

```text
├── docs/                       # Architectural specs, friction logs, and reports
│   ├── chain-api.md            # Chain shim API documentation
│   ├── e2e-full-report.md      # On-chain verified test report (16 transactions)
│   ├── friction-log.md         # Detailed hackathon friction log & proposals (14 points)
│   └── tech-stack.md           # Technology stack deep-dive
├── frontend/                   # Vite + React 19 web application
│   ├── src/                    # Components, pages, wallet context, chainClient
│   └── integration/            # Frontend integration test suite
├── shared/                     # Frozen contracts & types between layers
│   ├── types.ts                # Domain models (Bid, Ask, VaultState, LoanState)
│   └── chainClient.ts          # Typed HTTP client bridge
├── src/chain/                  # Ledger execution & enforcer engine
│   ├── accounts.ts             # Devnet account loading & role derivation
│   ├── enforcer/               # Multisig Call-Date policy enforcer daemon
│   ├── ops.ts                  # On-chain transaction builders & executors
│   ├── readLayer.ts            # Stateless ledger decoder & PPS / yield calculators
│   └── server.ts               # Chain shim HTTP service (:8787)
└── tests/                      # Backend unit test suite (24 tests)
```
