

## XRPL WORKSHOP
Building on the XRP
## Ledger
## Maxime Dienger
## Senior Developer Advocate, Ripple
## X @krkmu_
## 01

## THE XRP LEDGER
The XRP Ledger at a glance
## Fast
Transactions settle with finality in 35
seconds.
Low cost
Fractions of a cent per transaction.
## Proven
14+ years and 100M+ closed ledgers
without interruption.
## Decentralized
Validated by independent operators
worldwide, with no central gatekeeper.
## Sustainable
No mining, a very low, carbon-neutral
energy footprint.
Open source
Open server code and client libraries in
JS, Python, Java and more.
## 02

## THE XRP LEDGER
What makes XRPL different
No mining
Federated consensus among trusted
validators, no proof-of-work, no
staking.
Native primitives
Payments, tokens, DEX and escrow are
built into the protocol, no smart
contract needed.
Account reserves
1 XRP base reserve plus 0.2 XRP per
owned object.
Unified DEX and AMM
One shared order book and liquidity pools, open to
every asset on the ledger.
One API
Every feature sits behind the same JSONRPC and
WebSocket interface.
## 03

## THE XRP LEDGER
One endpoint to do all the things
A few lines of JavaScript, Python or Java reach every feature of the ledger.
Your app
SDK JS, Python, Java, Rust
and more
one API
XRP Ledger
## Payments
Fungible tokens
NFTs
## DEX & AMM
Escrow & checks
## RWA
DIDPrice oracles
## Credentials
## Account
management
## 04

## THE XRP LEDGER
Featured amendments
## LIVE ON MAINNET
MPTokens
## XLS33
A new fungible token standard.
TokenEscrow
## XLS85
Escrow IOUs and MPTs, not just XRP.
## Credentials
## XLS70
On-chain identity attestations.
## Permissioned Domains
## XLS80
Credential-gated regulated spaces.
## OPEN FOR VOTING
Lending protocol + SAV
## XLS65/66
Fixed-term loans from pooled vaults.
Permission delegation
## XLS75
Delegate permissions to other accounts.
Sponsored fees & reserves
## XLS68
A sponsor covers fees and reserves.
Confidential transfer
## XLS96
Shielded MPT amounts on-ledger.
## IN PROGRESS
## Smart Escrow
## XLS100
Programmable WASM escrow conditions.
Live status: livenet.xrpl.org/amendments
## 05
## XLS56
Atomic bundles, revised after review.
## Batch

## THE XRP LEDGER
The extended ecosystem
XRPL Mainnet
## Axelar
## ↔
bridges XRP and tokens
XRPL EVM Sidechain
Solidity smart contracts with XRP as gas.
## OTHER NETWORKS
## Xahau
Hooks: small on-ledger logic attached to
accounts.
## The Root Network
Gaming and metaverse infrastructure using
XRP for gas.
## Evernode
Decentralized hosting layer built on Xahau.
## 06

## THE XRP LEDGER
Choose your network
## PROD
XRPL Mainnet
The live network. Real XRP, real value,
real users.
## USE IT WHEN
Your app ships to real users and
moves real value.
## STAGING
XRPL Testnet
Replicates mainnet: the same active
amendments, on a test environment.
## USE IT WHEN
You build and test against exactly
what mainnet runs today.
## DEV
XRPL Devnet
Runs mainnetʼs amendments plus the
ones open for voting.
## USE IT WHEN
You want to try upcoming features
before they activate.
Learn more: xrpl.org/docs/concepts/networks-and-servers/parallel-networks
## 07

Code examples
Your first transaction in four steps
## 08

## CODE EXAMPLES
Client libraries
What is a client library?
A language-specific package that provides prebuilt
methods and typed models to simplify interacting
with an API.
xrpl.js
JavaScript / TypeScript
## Recommended
xrpl-py
## Python
## Recommended
xrpl4j
## Java
xrpl-rust
## Rust
Community libraries
Go, PHP, Ruby and more
## 09

## CODE EXAMPLES
Four steps to your first transaction
## 01
Connect to a node
Open a WebSocket to mainnet,
testnet or devnet.
## 02
Create or import a wallet
Generate a keypair; on testnet,
fund it from the faucet.
## 03
Prepare and send
Build the transaction JSON, sign
it and submit.
## 04
Read the result
Check the engine result and
transaction hash.
## 10

## CODE EXAMPLES · 1/4
Step 1: connect to a node
import { Client } from "xrpl" // Public testnet node, free, no
API key const client = new
Client("wss://s.altnet.rippletest.net:51233") await
client.connect()
Public networks
## Mainnet
wss://xrplcluster.com
## Testnet
wss://s.altnet.rippletest.net:51233
## Devnet
wss://s.devnet.rippletest.net:51233
## 11

## CODE EXAMPLES · 2/4
Step 2: create a wallet
// Generate and fund a wallet via the testnet faucet
const { wallet } = await  client.fundWallet()

console.log(wallet.address)  // "rf1BiG..."
console.log(wallet.seed)      // "sEd7ro..."

// Or import an existing account
const wallet = Wallet.fromSeed("sEd7...")
Good to know
The faucet funds each testnet wallet
with test XRP.
An account is only activated on
ledger once it holds the 1 XRP base
reserve.
The seed is the secret, never commit
it, never share it.
## 12

## CODE EXAMPLES · 3/4
Step 3: prepare and send
const tx = {
TransactionType: "Payment",
Account: wallet.address,
Destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
Amount: xrpToDrops("10"),  // 10 XRP, in drops
## }
const result = await client.submitAndWait(tx, {
autofill: true,
wallet,
## })

submitAndWait
Autofills Fee, Sequence and
LastLedgerSequence, signs locally.
Resolves once the tx is in a validated
ledger, usually 35 seconds.
## Drops
1 XRP  1,000,000 drops.
Sequence : your accountʼs tx counter,
prevents replay.
LastLedgerSequence : last ledger the tx
can enter, then it expires.
## 13

## CODE EXAMPLES · 4/4
Step 4: read the result
console.log(result.result.meta.TransactionResult)
// "tesSUCCESS"
console.log(result.result.hash)
// Look it up on any explorer
await client.disconnect()

Result codes
tes: success, applied to the ledger. tec: failed, but the fee was consumed.
Explorer: testnet.xrpl.org
Reference: xrpl.org/docs/references/protocol/transactions/transaction-results/tec-codes
## 14

## CODE EXAMPLES
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

## 15

Tokens on XRPL
Two standards: IOUs and multi-purpose tokens
## 16

## TOKENS ON XRPL
Two token standards
## SINCE 2012
## IOU
A promise between parties. Tokens live on bilateral
trustlines: each holder declares how much they trust
each issuer, per currency.
The historical standard that powers the DEX, the AMM and
years of issued currencies.
New standard
## XLS33 · LIVE ON MAINNET
Multi-purpose token
A single issuance object holders simply opt into.
On-chain metadata, an enforced supply cap and richer
issuer controls, without trustline complexity.
Designed for stablecoins, RWAs and everyday fungible
tokens.
## 17

## TOKENS ON XRPL
IOUs and trustlines
## 01
An issuer creates a token
An entity backs the tokenʼs value and is responsible for
redemption, USD, EUR, anything.
## 02
Holders set a trustline
A trustline says “I trust this issuer up to this amountˮ, one per
issuer and currency.
## 03
Tokens move as promises
Holding a token means holding the issuerʼs promise, the concept
behind stablecoins like RLUSD or USDC.
Real-world example
When you hold RLUSD on XRPL, you hold Rippleʼs
promise to redeem 1 USD per token.
You can only receive it after establishing trust with Ripple
as the issuer.
## 18

## TOKENS ON XRPL
IOU vs MPT
## IOUMPT
ModelBilateral trustlines, one per issuer and currencySingle issuance object, holders opt in by ID
Metadata3-character currency code onlyOn-chain metadata: ticker, name, icon, docs
SupplyNo native capMaximum supply enforced by the ledger
RipplingYes, needs careful flag configurationNone, simple, predictable balances
Issuer controlsFreeze, authorized trustlinesLock, require-auth, transfer fees, clawback
DEX & AMMFully supported, deep integrationsOn the roadmap; TokenEscrow works today
Building something new? Start with MPTs, the standard XRPL tooling is converging on. Reach for IOUs when you need
DEX and AMM support today.
## 20

## TOKENS ON XRPL
Issuing a token: IOU vs MPT
## IOU
// The token lives on trustlines: balances are
// tracked on RippleState entries, per holder.
// One-time issuer account setup
{ TransactionType: "AccountSet",
SetFlag: 8 } // asfDefaultRipple

// Issue = send a Payment to a holder
## Amount: {
currency: "USD",
issuer: issuer.address,
value: "100",
## }

## MPT
// The token lives in its own ledger object:
// one MPTokenIssuance, shared by all holders.
await client.submitAndWait({
TransactionType: "MPTokenIssuanceCreate",
Account: issuer.address,
AssetScale: 2,
MaximumAmount: "1000000",
MPTokenMetadata: "...", // ticker, name, icon
}, { autofill: true, wallet: issuer })

// Issue = send a Payment to a holder
Amount: { mpt_issuance_id: id, value: "100" }

## 21

## TOKENS ON XRPL
Accepting a token: IOU vs MPT
## IOU
// Opt in with a trustline, one per issuer and
currency
await client.submitAndWait({
TransactionType: "TrustSet",
Account: holder.address,
LimitAmount: {
currency: "USD",
issuer: issuer.address,
value: "1000000", // trust limit
## },
}, { autofill: true, wallet: holder })

## MPT
// Opt in with the issuance ID, one
transaction
await client.submitAndWait({
TransactionType: "MPTokenAuthorize",
Account: holder.address,
MPTokenIssuanceID: id,
}, { autofill: true, wallet: holder })

## 22

## TOKENS ON XRPL
Get RLUSD on testnet
## 01
Open tryrlusd.com
Scan the QR code or type the address, no sign-up needed.
## 02
Connect your wallet
The trustline to the RLUSD issuer is set up for you.
## 03
Receive test RLUSD
Now you can send, receive and exchange RLUSD on XRPL Testnet.
Test RLUSD faucet
tryrlusd.com
## 23

## TOOLING
Choose your wallet
## Xaman
Mobile app
xaman.app
## Crossmark
Browser extension
crossmark.io
GemWallet
gemwallet.app
## Joey
Mobile app
joeywallet.xyz
Wallet-as-a-Service Palisade)
Embed secure XRPL wallets in your product with an API · docs.ripple.com/products/wallet
## Ripple Custody
Institutional digital asset custody technology · ripple.com/solutions/digital-asset-custody
and more!
## 24
Browser extension

## TOOLING
Builder toolkit
xrpl-connect
One SDK to rule all wallets: Xaman,
Crossmark, GemWallet and more behind a
single interface.
github.com/XRPLCommons/xrpl-connect
Amendment testing suite
Try new amendments, MPT, escrow and
more, against live networks from your
browser.
tests.xrpl-commons.org
Scaffold-XRP
A full-stack starter kit: bootstrap an XRPL
dApp with wallet connection and UI in
minutes.
github.com/XRPLCommons/scaffold-xrp
## Bedrock
Building blocks for XRPL projects,
maintained by XRPL Commons.
github.com/XRPLCommons/Bedrock
And more on the official docs: xrpl.org/resources/dev-tools
## 25

## TOOLING
Reference app: Lending Protocol & SAV
Test the lending protocol and Single Asset Vault end to end, then fork the codebase to build your
own.
## LIVE DEMO
Try the demo
Create vaults, deposit, originate and
repay loans, and inspect every state
transition on-chain.
lending.xls-demo.com
## OPEN SOURCE
Fork the codebase
The full reference implementation, ready
to fork as the starting point for your own
app.
github.com/ripple/xrpl-reference-app-lending-
sav
## 26
## TOOLING
Reference app: Lending Protocol & SAV
Test the lending protocol and Single Asset Vault end to end, then fork the codebase to build your
own.
## LIVE DEMO
Try the demo
Create vaults, deposit, originate and
repay loans, and inspect every state
transition on-chain.
lending.xls-demo.com
## OPEN SOURCE
Fork the codebase
The full reference implementation, ready
to fork as the starting point for your own
app.
github.com/ripple/xrpl-reference-app-lending-
sav

## TOOLING
AI agents on the XRPL
## XRPL AI
The home of AI on the XRP Ledger: projects,
resources and community.
xrpl-ai.org
t54 Labs
Agentic payment infrastructure: tooling for AI
agents to transact safely.
t54.ai
XRPL Docs MCP server
Plug the XRPL documentation into Claude, Cursor
and other AI tools.
mcp.xrpledger.ai
XRPL AI starter kit
Agentic transactions: get an AI agent sending its
first XRPL transaction.
xrpl.org/docs/agents/agentic-transactions
## 27

## X @krkmu_
## THANK YOU
## Resources
DevRel
All the resources to get started
linktr.ee/rippledevrel
XRPL resource index
github.com/RippleDevRel/xrpl-ressource-index
XRPL documentation
Concepts, references, tutorials and dev
tools.
xrpl.org/docs
## 28