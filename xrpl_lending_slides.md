# XRPL Lending Protocol — Agent-Readable Slides

> Converted from the two uploaded PDF slide decks. Content is kept source-faithful; slide/page boundaries are preserved.

# final lending intro

## Slide 1

RIPPLE · XRPL
  XLS65  XLS66            HACKATHON 2026 · XRPL LENDING PROTOCOL
Build Lending Apps on
the XRP Ledger.
Single Asset Vaults (XLS65) + Lending Protocol (XLS66). Native
primitives, no smart contracts.
NATIVE ONCHAIN PRIMITIVES                                            XRPL LENDING PROTOCOL · HACKATHON

## Slide 2

SECTION 1
Lending as a
Financial Activity.
                      XRPL LENDING PROTOCOL · HACKATHON

## Slide 3

LENDING AS A FINANCIAL ACTIVITY                                                                                                              03 · 21
WHAT IS LENDING
The tri-party model
Someone has idle capital. Someone needs it. A third party manages the risk.
   01 · LENDER                                      02 · INTERMEDIARY                                 03 · BORROWER
   Idle capital seeking return                      Risk management and matching                      Capital demand
   Has assets (cash, tokens, stablecoins)           Connects lenders and borrowers.                   Needs capital for a specific purpose:
   sitting unused. Wants yield. Deposits            Underwrites credit risk, sets loan terms,         fund a payment corridor, finance
   into a pool or directly lends to a               collects fees, and absorbs first losses if        inventory, bridge a settlement cycle.
   borrower.                                        things go wrong.                                  Pays interest for access to that capital.
Interest is the price of using someone else's money. The intermediary earns a spread for managing risk.
                                                                                                                      XRPL LENDING PROTOCOL · HACKATHON

## Slide 4

LENDING AS A FINANCIAL ACTIVITY
WHY ONCHAIN                                                                                                                                         04 · 21
The case for on-chain credit
Traditional lending is slow, opaque, and expensive. On-chain makes it composable.
   01 · HYBRID BY DESIGN                                                           02 · RISK ISOLATION PER VAULT
   Underwriting and collateral stay off-chain.                                     One protocol, many vaults.
   Only asset pooling and financing flows run on-ledger. FIs keep                  One protocol supports multiple vaults, each isolated by asset, lender or
   existing credit processes intact and automate what gains most from              borrower. Stables / XRP can sit in a dedicated vault with no commingling,
   being on-chain. Collateral sits with a custodian, never exposed to              independently permissioned with whitelisted depositors and KYC’d
   smart contract risk.                                                            borrowers.
   03 · FIXED TERM, FIXED RATE                                                     04 · REAL IDENTITIES, NOT PSEUDONYMS
   Predictable revenue, clean accounting.                                          Known counterparties, not anonymous wallets.
   Interest is fixed at origination, not variable as in DeFi. Institutions can     On-chain collateral is replaced by real businesses underwritten in
   forecast revenue with certainty and report yield clearly to auditors            the real world. Borrowers and lenders are KYC’d, with legal
   and regulators under IFRS and GAAP.                                             agreements enforced off-chain.
            05 · CAPITAL AGGREGATION AT SCALE
            Pool many small deposits into institutional-size loan
            Set up a many-to-one vaults where retail holders around the world can deploy capital. Vault acst a sa liquidity pool which can be
            tapped into to meet institutional size
Transparency (all terms and repayments on-ledger), composability (vault shares usable in other protocols), and auditability (13 years of ledger history)
complete the case.

## Slide 5

SECTION 2
XRPL Lending
Protocol
Overview.
               XRPL LENDING PROTOCOL · HACKATHON

## Slide 6

XRPL LENDING PROTOCOL                                                                                                                                    07 · 21
TWO PRIMITIVES
SAV + Lending Protocol = end-to-end lending
Two native primitives. One system.
 XLS65       Single Asset Vault                                                       XLS66     Lending Protocol
Aggregates assets from multiple depositors into a single pool. Issues                Distributes vault liquidity as fixed-term loans. Manages loan lifecycle:
yield-bearing shares (MPTs) that represent each depositor's pro-rata                 origination, repayment, default. Loan Broker intermediary handles fees,
ownership. Supports XRP, IOUs, and MPTs as vault assets.                             first-loss capital, and debt tracking.
Think of it as: the capital pool.                                                    Think of it as: the loan engine.
 VaultDeposit       VaultWithdraw    VaultSet     VaultClawback                        LoanBrokerSet      LoanSet       LoanPay      LoanManage
Not a smart contract you deploy. A native protocol on the ledger. Configure and use it via transaction types, accessible through JS/Go SDKs and APIs.
                                                                                                                                  XRPL LENDING PROTOCOL · HACKATHON

## Slide 7

XRPL LENDING PROTOCOL                                                                                   07 · 21
TWO PRIMITIVES
SAV + Lending Protocol = end-to-end lending
Two native primitives. One system.
                                                       E2E Lending Protocol
                                                                              Pool manager: a
                                                                              loan manager who
                          -> Lending Protocol (LP)                             oversees lending &
                                                         LP                   borrowing,
                                                                              servicing, fees etc
           +                              =
                          -> Single Asset Vault (SAV)
                                                                   SAV
                                                                                 XRPL LENDING PROTOCOL · HACKATHON

## Slide 8

XRPL LENDING PROTOCOL                                                                                                                         08 · 21
THE ACTORS
Four roles in the system
XRPL handles everything below the application layer. You build the interface.
    1                                       2                                    3                                4
  Lender                                   Loan Broker                          Borrower                         Your Application
  Deposits assets into vault.              Creates vault and lending            Co-signs loan with broker.       The UI that makes it human. LP
  Receives yield-bearing shares            protocol. Sets fees, interest        Receives principal from vault.   dashboard, loan request forms,
  (MPT). Can withdraw at any               rates, debt caps. Deposits           Repays on schedule.              admin panels. KYC/compliance
  time (open-ended) or at                  first-loss capital. Approves         Underwrites performed            integration. Collateral tracking
  maturity (closed-ended).                 borrowers (off-chain). Manages       off-chain. Collateral held       (off-chain). Built on XRPL APIs
                                           loan lifecycle.                      off-protocol.                    and SDKs.
  SUPPLIES CAPITAL                         MANAGES RISK                         DEMANDS CAPITAL                  YOU BUILD THIS
                                                                                                                      XRPL LENDING PROTOCOL · HACKATHON

## Slide 9

XRPL LENDING PROTOCOL                                                                 09 · 21
XRPL VS EVM
XRPL-way Of Building
XRPL is buying a suit off the rack which you modify.
  XRPL
  Buying a suit off the rack and tailoring the fit (shorten
  sleeves, tighten waist). You configure and deploy —
  it's your SAV & LP.
  EVM
  Buying fabric and a sewing machine, then stitching
  the entire suit yourself. Full creative control, but every
  ripped seam is yours to fix.
                                                               XRPL LENDING PROTOCOL · HACKATHON

## Slide 10

XRPL LENDING PROTOCOL                                                                                                                            10 · 21
   TWO FLAVORS
   Open-ended and closed-ended vaults
   Same primitive, two modes. The difference is when capital moves.
OPENENDED                                                                        CLOSEDENDED
Continuous liquidity.                                                             Fixed lifecycle.
Deposits and withdrawals at any time. Share price adjusts dynamically as          Three phases: Subscription, Investment, Redemption. No mid-term entry or
interest accrues. Capital recycles continuously into new loans.                   exit. Interest injected via tfVaultDonation (raises PPS without minting shares).
Entry / Exit                                                         Any time     Entry / Exit                     Subscription and redemption windows only
PPS movement                               Continuous, as interest accrues        PPS movement                                      At interest injection events
Loan recycling                         Yes, capital re-deployed on repayment      Loan recycling                                    No, fixed-term deployment
Best for                                Revolving credit, PayFi, yield products   Best for                            Bonds, credit funds, structured products
                                                                                                                             XRPL LENDING PROTOCOL · HACKATHON

## Slide 11

SECTION 3
Open-Ended
Vaults. Use Cases.
                     XRPL LENDING PROTOCOL · HACKATHON

## Slide 12

OPENENDED VAULTS                                                                                                                                    12 · 21
HOW IT WORKS
Continuous deposit and withdrawal
Deposit anytime. Earn yield. Withdraw anytime. The vault is always open.
    1   Deposit                            2   Deploy                         3       Earn                              4    Withdraw
   Lender sends assets to vault.          Broker originates loans from       Borrower repays principal +               Lender burns shares. Receives
   Shares minted proportionally.          vault liquidity. Borrower          interest. Fees split to broker.           assets at current PPS. More out
   PPS at time of entry determines        co-signs via LoanSet. Principal    Vault assets increase, PPS                than in (if yield accrued).
   share count.                           transferred on-chain.              rises.
   VaultDeposit                           LoanSet                             LoanPay                                   VaultWithdraw
KEY MECHANICS
-> PPS = AssetsTotal / SharesTotal                                           -> Withdrawals always permitted (no lock)
                                                                            -> FLC absorbs first losses on default
                                                                                                                            XRPL LENDING PROTOCOL · HACKATHON

## Slide 13

OPENENDED · USE CASE 1                                                                                                                                              13 · 21
PAYFI
Cross-border payment ﬁnancing
Short-term RLUSD loans to fintechs. Yield from real payment demand.
    1   LPs deposit RLUSD                                      2   Fintech borrows                                       3   Repay and recycle
   Stablecoin holders deposit into vault via app UI.          Payment company needs 3 to 30 day RLUSD to                Fintech repays when fiat settlement arrives.
   Receive shares representing their claim on the             settle cross-border transactions. Broker                  Capital returns to vault, ready for the next loan.
   pool.                                                      underwrites off-chain, originates loan on-chain.          LPs earn continuous yield.
   SUPPLY SIDE                                                DEMAND SIDE                                               YIELD ENGINE
WHY THIS WORKS ON XRPL
-> Near-zero fees: recycling capital 30x/month is economical                              -> 35s settlement: fintechs get funds immediately
-> RLUSD native: no bridging, no wrapping, no slippage                                    -> Permissioned access: KYC gating via Credentials
                                                                                                                                             XRPL LENDING PROTOCOL · HACKATHON

## Slide 14

OPENENDED · USE CASE 2                                                                                                                                          14 · 21
XRP YIELD
XRP yield for wallets and exchanges
Users deposit XRP and earn. You build the front-end.
    1    User holds XRP                                      2   App offers "staking"                                  3    Yield flows back
   XRP sits idle in a CEX or self-custody wallet. User      Your app deposits user XRP into a vault.                  Borrower repays interest to vault. PPS rises. User
   wants yield but does not want to offramp or              Institutional borrower (prime broker, market              sees yield accruing in their wallet. No bridging,
   manage DeFi positions manually.                          maker) borrows XRP and pays interest.                     no wrapping. XRP stays on XRPL mainnet.
                                                            Open-ended: user can exit freely.
   THE PROBLEM                                              YOUR PRODUCT                                              THE OUTCOME
WHAT YOU BUILD
-> LP dashboard: deposit, track yield, withdraw                                         -> KYC/compliance: whitelist lenders and borrowers
-> Collateral tracking: off-chain, linked via URI metadata                              -> Admin panel: loan approval, monitoring, fee config
                                                                                                                                        XRPL LENDING PROTOCOL · HACKATHON

## Slide 15

SECTION 4
Closed-Ended
Vaults. Use Cases.
                     XRPL LENDING PROTOCOL · HACKATHON

## Slide 16

CLOSEDENDED VAULTS                                                                                                                             17 · 21
HOW IT WORKS
Three-phase lifecycle
Subscribe. Invest. Redeem. No mid-term entry or exit. Think of it as a bond.
    1   Subscription
  Vault opens for deposits. LPs send assets,
  receive shares. Broker sets the subscription
  window (e.g., 30 days). Once closed, no new
  deposits accepted.
  CAPITAL RAISING
                                                           2   Investment
                                                          Broker deploys capital into fixed-term loans.
                                                          Interest injected via tfVaultDonation. PPS
                                                          rises without minting new shares. No
                                                          withdrawals during this phase.
                                                          CAPITAL AT WORK
                                                                                                          3    Redemption
                                                                                                          Loans mature and repay. Vault reopens for
                                                                                                          withdrawals. LPs redeem shares at final PPS.
                                                                                                          Principal + earned yield returned.
                                                                                                          CAPITAL RETURNED
                                                                                                                        XRPL LENDING PROTOCOL · HACKATHON

## Slide 17

CLOSEDENDED · USE CASE 2                                                                                                                                        19 · 21
TOKENIZED BOND
Tokenized bond issuance
Map a bond's lifecycle directly onto a vault.
  BOND CONCEPT                                      VAULT EQUIVALENT                                  MECHANISM
  Bond offering period                              Subscription window                               Vault open for VaultDeposit; shares minted to investors
  Bond tenor                                        Investment period                                 Vault closed; capital deployed via LoanSet; deposits blocked
  Coupon payment                                    Interest injection                                Broker calls VaultDeposit with tfVaultDonation flag; PPS rises
  Bond maturity / principal return                  Redemption window                                 Loans repay; vault reopens for VaultWithdraw
  Bond token                                        Vault shares (MPT)                                Transferable (if configured); represent claim on principal + yield
Vault shares are the bond tokens. Issuers can configure transferability, permissioned access, and non-transferable (hold-to-maturity) modes.
                                                                                                                                        XRPL LENDING PROTOCOL · HACKATHON

## Slide 18

CLOSEDENDED · USE CASE 3                                                                                                                                      20 · 21
SAVINGS PRODUCT
Structured savings product
90-day savings vault. Predictable return.
    1   User deposits                                                                                                3    User redeems
   Neobank or fintech app offers a "90-day                                                                          At maturity, all loans repay. User redeems
   savings product." User deposits RLUSD                                                                            shares at final PPS. Principal + yield
   during the subscription window. No                                                                               returned. App can offer next cycle
   decisions needed until maturity.                                                                                 automatically.
   SIMPLE UX                                                                                                        PREDICTABLE RETURN
                                                            2    App deploys capital
                                                           The fintech (as loan broker) deploys capital
                                                           into diversified short-duration loans. Multiple
                                                           borrowers, concentration limits, FLC buffer.
                                                           DIVERSIFIED RISK
WHY CLOSEDENDED FOR RETAIL
-> No mid-term decisions: deposit, wait, collect                                      -> Predictable: term and expected yield known at entry
-> Simpler compliance: fixed investor set, known duration                             -> Composable: next cycle vault can auto-roll capital
                                                                                                                                       XRPL LENDING PROTOCOL · HACKATHON

## Slide 19

RESOURCES                                                                                                                                                    References
START BUILDING
Specs, demo app, explorer, docs, and sandbox.
  01 · DEMO APP                             02 · TECH SPEC                             03 · TECH SPEC                           04 · EXPLORER
  Lending Protocol Demo                     XLS-65 · Single Asset Vault                XLS-66 · Lending Protocol                XRPL Explorer · Vault Pages
  Application
  Interactive reference app. Create a       Full specification: vault creation,        Full specification: loan broker,         Live vault ranking, vault detail pages,
  vault, originate a loan, process          deposits, withdrawals, share math,         origination, repayment, default, fee     loan tracking, protocol-wide metrics.
  repayment. Run it on testnet to see the   clawback, donation, insolvency             structure, first-loss capital.           Due diligence in 5 minutes.
  full lifecycle.                           handling.
  github.com/ripple/lending-demo            xls.xrpl.org/xls/XLS-0065                  xls.xrpl.org/xls/XLS-0066                livenet.xrpl.org
  05 · DOCS                                 06 · TUTORIAL                              07 · SANDBOX
  XRPL Developer Documentation              Step-by-Step Lending                       Testnet and Devnet
                                            Walkthrough
 Transaction types, ledger entries, API     End-to-end guide: create vault,            Test your integration against live
 references, JS and Go SDKs. The            configure loan broker, originate a loan,   ledger replicas before mainnet. No
 canonical reference for building on        process repayment, handle default.         real assets at risk. Faucet available.
 XRPL.
  xrpl.org/docs                             xrpl.org/docs/tutorials/lending            xrpl.org/resources/dev-tools
                                                                                                                                      XRPL LENDING PROTOCOL · HACKATHON

# XRPL Workshop - Lending Protocol Hackathon

## Slide 1

XRPL WORKSHOP
Building on the XRP
Ledger
         Maxime Dienger
         Senior Developer Advocate, Ripple
                                             X @krkmu_
                                                          01

## Slide 2

THE XRP LEDGER
The XRP Ledger at a glance
  Fast                                       Low cost                                Proven
  Transactions settle with finality in 3-5   Fractions of a cent per transaction.    14+ years and 100M+ closed ledgers
  seconds.                                                                           without interruption.
  Decentralized                              Sustainable                             Open source
  Validated by independent operators         No mining, a very low, carbon-neutral   Open server code and client libraries in
  worldwide, with no central gatekeeper.     energy footprint.                       JS, Python, Java and more.
                                                                                                                                02

## Slide 3

THE XRP LEDGER
What makes XRPL different
  No mining                                     Native primitives                          Account reserves
  Federated consensus among trusted             Payments, tokens, DEX and escrow are       1 XRP base reserve plus 0.2 XRP per
  validators, no proof-of-work, no              built into the protocol, no smart          owned object.
  staking.                                      contract needed.
          Unified DEX and AMM                                                One API
          One shared order book and liquidity pools, open to                 Every feature sits behind the same JSONRPC and
          every asset on the ledger.                                         WebSocket interface.
                                                                                                                                 03

## Slide 4

THE XRP LEDGER
One endpoint to do all the things
A few lines of JavaScript, Python or Java reach every feature of the ledger.
                                                                               Payments          Fungible tokens
                                                                               NFTs              DEX & AMM
                                   one API                                     Escrow & checks   RWA
           Your app
                                                XRP Ledger
    SDK JS, Python, Java, Rust
             and more                                                          DID               Price oracles
                                                                                                 Account
                                                                               Credentials
                                                                                                 management
                                                                                                                   04

## Slide 5

THE XRP LEDGER
Featured amendments
   LIVE ON MAINNET                            OPEN FOR VOTING                              IN PROGRESS
   MPTokens                          XLS33   Lending protocol + SAV           XLS65/66   Smart Escrow                XLS100
   A new fungible token standard.             Fixed-term loans from pooled vaults.         Programmable WASM escrow conditions.
   TokenEscrow                       XLS85   Permission delegation               XLS75
   Escrow IOUs and MPTs, not just XRP.        Delegate permissions to other accounts.
   Credentials                       XLS70   Sponsored fees & reserves           XLS68
   On-chain identity attestations.            A sponsor covers fees and reserves.
   Permissioned Domains              XLS80   Confidential transfer               XLS96
   Credential-gated regulated spaces.         Shielded MPT amounts on-ledger.
                                              Batch                             XLS56
                                              Atomic bundles, revised after review.
Live status: livenet.xrpl.org/amendments
                                                                                                                                  05

## Slide 6

THE XRP LEDGER
The extended ecosystem
                                                             Axelar                           XRPL EVM Sidechain
                                                              ↔                          Solidity smart contracts with XRP as gas.
                 XRPL Mainnet                         bridges XRP and tokens
OTHER NETWORKS
  Xahau                                      The Root Network                                 Evernode
  Hooks: small on-ledger logic attached to   Gaming and metaverse infrastructure using        Decentralized hosting layer built on Xahau.
  accounts.                                  XRP for gas.
                                                                                                                                            06

## Slide 7

THE XRP LEDGER
Choose your network
     PROD                                            STAGING                               DEV
   XRPL Mainnet                                    XRPL Testnet                           XRPL Devnet
   The live network. Real XRP, real value,         Replicates mainnet: the same active    Runs mainnetʼs amendments plus the
   real users.                                     amendments, on a test environment.     ones open for voting.
     USE IT WHEN                                     USE IT WHEN                           USE IT WHEN
     Your app ships to real users and                You build and test against exactly    You want to try upcoming features
     moves real value.                               what mainnet runs today.              before they activate.
Learn more: xrpl.org/docs/concepts/networks-and-servers/parallel-networks
                                                                                                                               07

## Slide 8

Code examples
Your first transaction in four steps
                                       08

## Slide 9

CODE EXAMPLES
Client libraries
                                                                     xrpl.js
                                                                                               Recommended
                                                                     JavaScript / TypeScript
   What is a client library?
                                                              xrpl-py
                                                                                               Recommended
   A language-specific package that provides prebuilt         Python
   methods and typed models to simplify interacting
   with an API.
                                                              xrpl4j
                                                              Java
                                                              xrpl-rust
                                                              Rust
                                                        Community libraries
                                                        Go, PHP, Ruby and more
                                                                                                             09

## Slide 10

CODE EXAMPLES
Four steps to your first transaction
01                             02                                03                                 04
Connect to a node              Create or import a wallet Prepare and send                           Read the result
Open a WebSocket to mainnet,   Generate a keypair; on testnet,   Build the transaction JSON, sign   Check the engine result and
testnet or devnet.             fund it from the faucet.          it and submit.                     transaction hash.
                                                                                                                                  10

## Slide 11

CODE EXAMPLES · 1/4
Step 1: connect to a node
    import { Client } from "xrpl" // Public testnet node, free, no   Public networks
    API key const client = new                                       Mainnet
    Client("wss://s.altnet.rippletest.net:51233") await              wss://xrplcluster.com
    client.connect()                                                 Testnet
                                                                     wss://s.altnet.rippletest.net:51233
                                                                     Devnet
                                                                     wss://s.devnet.rippletest.net:51233
                                                                                                           11

## Slide 12

CODE EXAMPLES · 2/4
Step 2: create a wallet
    // Generate and fund a wallet via the testnet faucet   Good to know
    const { wallet } = await   client.fundWallet()         The faucet funds each testnet wallet
                                                           with test XRP.
    console.log(wallet.address)   // "rf1BiG…"             An account is only activated on
    console.log(wallet.seed)      // "sEd7ro…"             ledger once it holds the 1 XRP base
                                                           reserve.
    // Or import an existing account                       The seed is the secret, never commit
    const wallet = Wallet.fromSeed("sEd7…")                it, never share it.
                                                                                                  12

## Slide 13

CODE EXAMPLES · 3/4
Step 3: prepare and send
                                                              submitAndWait
        const tx = {                                          Autofills Fee, Sequence and
                                                              LastLedgerSequence, signs locally.
         TransactionType: "Payment",
                                                              Resolves once the tx is in a validated
         Account: wallet.address,                             ledger, usually 3-5 seconds.
         Destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
         Amount: xrpToDrops("10"),   // 10 XRP, in drops
                                                              Drops
        }
                                                              1 XRP = 1,000,000 drops.
        const result = await client.submitAndWait(tx, {
         autofill: true,
         wallet,                                              Sequence : your accountʼs tx counter,
                                                              prevents replay.
        })                                                    LastLedgerSequence : last ledger the tx
                                                              can enter, then it expires.
                                                                                                        13

## Slide 14

CODE EXAMPLES · 4/4
Step 4: read the result
        console.log(result.result.meta.TransactionResult)
        // "tesSUCCESS"
        console.log(result.result.hash)
        // Look it up on any explorer
        await client.disconnect()
   Result codes       tes: success, applied to the ledger. tec: failed, but the fee was consumed.
                      Explorer: testnet.xrpl.org
                      Reference: xrpl.org/docs/references/protocol/transactions/transaction-results/tec-codes
                                                                                                                14

## Slide 15

CODE EXAMPLES
The entire code
        import { Client, Wallet, xrpToDrops } from "xrpl"
        const client = new Client("wss://s.altnet.rippletest.net:51233")   // 1. connect
        await client.connect()
        const { wallet } = await client.fundWallet()                        // 2. wallet
        const result = await client.submitAndWait({                         // 3. send
         TransactionType: "Payment",
         Account: wallet.address,
         Destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
         Amount: xrpToDrops("10"),
        }, { autofill: true, wallet })
        console.log(result.result.meta.TransactionResult)                   // 4. result
        await client.disconnect()
                                                                                           15

## Slide 16

Tokens on XRPL
Two standards: IOUs and multi-purpose tokens
                                               16

## Slide 17

TOKENS ON XRPL
Two token standards
                                                                                                         New standard
   SINCE 2012                                                 XLS33 · LIVE ON MAINNET
   IOU                                                        Multi-purpose token
   A promise between parties. Tokens live on bilateral        A single issuance object holders simply opt into.
   trustlines: each holder declares how much they trust       On-chain metadata, an enforced supply cap and richer
   each issuer, per currency.                                 issuer controls, without trustline complexity.
   The historical standard that powers the DEX, the AMM and   Designed for stablecoins, RWAs and everyday fungible
   years of issued currencies.                                tokens.
                                                                                                                        17

## Slide 18

TOKENS ON XRPL
IOUs and trustlines
01   An issuer creates a token
     An entity backs the tokenʼs value and is responsible for
     redemption, USD, EUR, anything.
02 Holders set a trustline                                               Real-world example
     A trustline says “I trust this issuer up to this amountˮ, one per
                                                                         When you hold RLUSD on XRPL, you hold Rippleʼs
     issuer and currency.
                                                                         promise to redeem 1 USD per token.
03 Tokens move as promises                                               You can only receive it after establishing trust with Ripple
     Holding a token means holding the issuerʼs promise, the concept     as the issuer.
     behind stablecoins like RLUSD or USDC.
                                                                                                                                        18

## Slide 19

TOKENS ON XRPL
IOU vs MPT
                          IOU                                                 MPT
Model                     Bilateral trustlines, one per issuer and currency   Single issuance object, holders opt in by ID
Metadata                  3-character currency code only                      On-chain metadata: ticker, name, icon, docs
Supply                    No native cap                                       Maximum supply enforced by the ledger
Rippling                  Yes, needs careful flag configuration               None, simple, predictable balances
Issuer controls           Freeze, authorized trustlines                       Lock, require-auth, transfer fees, clawback
DEX & AMM                 Fully supported, deep integrations                  On the roadmap; TokenEscrow works today
           Building something new? Start with MPTs, the standard XRPL tooling is converging on. Reach for IOUs when you need
           DEX and AMM support today.
                                                                                                                               20

## Slide 20

TOKENS ON XRPL
Issuing a token: IOU vs MPT
IOU                                                    MPT
      // The token lives on trustlines: balances are         // The token lives in its own ledger object:
      // tracked on RippleState entries, per holder.         // one MPTokenIssuance, shared by all holders.
      // One-time issuer account setup                       await client.submitAndWait({
      { TransactionType: "AccountSet",                       TransactionType: "MPTokenIssuanceCreate",
      SetFlag: 8 } // asfDefaultRipple                       Account: issuer.address,
                                                             AssetScale: 2,
      // Issue = send a Payment to a holder                  MaximumAmount: "1000000",
      Amount: {                                              MPTokenMetadata: "…", // ticker, name, icon
      currency: "USD",                                       }, { autofill: true, wallet: issuer })
      issuer: issuer.address,
      value: "100",                                          // Issue = send a Payment to a holder
      }                                                      Amount: { mpt_issuance_id: id, value: "100" }
                                                                                                              21

## Slide 21

TOKENS ON XRPL
Accepting a token: IOU vs MPT
IOU                                                    MPT
      // Opt in with a trustline, one per issuer and         // Opt in with the issuance ID, one
      currency                                               transaction
      await client.submitAndWait({                           await client.submitAndWait({
      TransactionType: "TrustSet",                           TransactionType: "MPTokenAuthorize",
      Account: holder.address,                               Account: holder.address,
      LimitAmount: {                                         MPTokenIssuanceID: id,
         currency: "USD",                                    }, { autofill: true, wallet: holder })
         issuer: issuer.address,
         value: "1000000", // trust limit
      },
      }, { autofill: true, wallet: holder })
                                                                                                      22

## Slide 22

TOKENS ON XRPL
Get RLUSD on testnet
                                                                     Test RLUSD faucet
01   Open tryrlusd.com
     Scan the QR code or type the address, no sign-up needed.
02 Connect your wallet
     The trustline to the RLUSD issuer is set up for you.
03 Receive test RLUSD
     Now you can send, receive and exchange RLUSD on XRPL Testnet.
                                                                     tryrlusd.com
                                                                                         23

## Slide 23

TOOLING
Choose your wallet
  Xaman                                    Crossmark                              GemWallet             Joey
   Mobile app                               Browser extension                       Browser extension    Mobile app
  xaman.app                                crossmark.io                           gemwallet.app         joeywallet.xyz
          Wallet-as-a-Service (Palisade)
          Embed secure XRPL wallets in your product with an API · docs.ripple.com/products/wallet
                                                                                                                         and more!
          Ripple Custody
          Institutional digital asset custody technology · ripple.com/solutions/digital-asset-custody
                                                                                                                                     24

## Slide 24

TOOLING
Builder toolkit
           xrpl-connect                                       Amendment testing suite
           One SDK to rule all wallets: Xaman,                Try new amendments, MPT, escrow and
           Crossmark, GemWallet and more behind a             more, against live networks from your
           single interface.                                  browser.
           github.com/XRPLCommons/xrpl-connect               tests.xrpl-commons.org
           Scaffold-XRP                                       Bedrock
           A full-stack starter kit: bootstrap an XRPL        Building blocks for XRPL projects,
           dApp with wallet connection and UI in              maintained by XRPL Commons.
           minutes.
                                                              github.com/XRPLCommons/Bedrock
           github.com/XRPLCommons/scaffold-xrp
And more on the official docs: xrpl.org/resources/dev-tools
                                                                                                      25

## Slide 25

TOOLING
Reference app: Lending Protocol & SAV
Test the lending protocol and Single Asset Vault end to end, then fork the codebase to build your
own.
                                                                   OPEN SOURCE
    LIVE DEMO
   Try the demo                                                  Fork the codebase
                                                                 The full reference implementation, ready
   Create vaults, deposit, originate and
                                                                 to fork as the starting point for your own
   repay loans, and inspect every state
                                                                 app.
   transition on-chain.
                                                                 github.com/ripple/xrpl-reference-app-lending-
   lending.xls-demo.com                                          sav
                                                                                                                 26

## Slide 26

TOOLING
AI agents on the XRPL
  XRPL AI                                           t54 Labs
  The home of AI on the XRP Ledger: projects,       Agentic payment infrastructure: tooling for AI
  resources and community.                          agents to transact safely.
  xrpl-ai.org                                       t54.ai
                                                    XRPL AI starter kit
  XRPL Docs MCP server
                                                    Agentic transactions: get an AI agent sending its
  Plug the XRPL documentation into Claude, Cursor
                                                    first XRPL transaction.
  and other AI tools.
                                                    xrpl.org/docs/agents/agentic-transactions
  mcp.xrpledger.ai
                                                                                                        27

## Slide 27

X @krkmu_
THANK YOU
Resources
  DevRel                                                   XRPL documentation
            All the resources to get started
            linktr.ee/rippledevrel
                                                                         Concepts, references, tutorials and dev
                                                                         tools.
            XRPL resource index
                                                                         xrpl.org/docs
            github.com/RippleDevRel/xrpl-ressource-index
                                                                                                                     28
