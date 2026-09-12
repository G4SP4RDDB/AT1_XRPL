

## XRPL HACKATHON · CHALLENGE BRIEF
## Lending Protocol &

## Single Asset Vaults
## X @krkmu_
## 01

## PICK YOUR TRACK
Two tracks, one vault type each
## TRACK 1
Open-ended vault
The standard Single Asset Vault, unchanged. Deposits and
withdrawals stay open throughout the vault's life, with no
time-based gating.
Loans are term-bound, the vault is not.
## TRACK 2
Closed-ended vault
New in Lending Protocol V1.1. A date-driven extension that
enforces a deterministic three-phase lifecycle: Subscription,
## Investment, Redemption.
Two immutable dates set at VaultCreate drive the phases.
Bring your own use case if you prefer, as long as it exercises XLS-65/66 tooling and generates feedback.
## 02

## TRACK 1 · OPENENDED VAULT
An end-to-end lending flow
What it is
The standard Single Asset Vault. Capital can enter
and exit at any point in the vault's life.
Loans are term-bound, the vault is not.
Build the flow, wrap a real use case around it, report
on the journey.
## MINIMUM BAR · BOTH FLAVOURS
## 01
Create an open-ended Single Asset Vault
## 02
Deposit capital from at least one lender account
## 03
Set up a loan broker, originate a loan the borrower accepts
## 04
Execute a drawdown, process at least one repayment
## 05
Withdraw capital plus accrued
yield
## 06
Show one guardrail enforcing: a rejected transaction
Use cases, or bring your own. Trade receivables finance · institutional term credit · treasury yield · impairment, default and recovery.
## 03

## TRACK 2 · CLOSEDENDED VAULT
The full three-phase lifecycle
What it is
A date-driven vault enforcing three phases from two
immutable dates set at VaultCreate. Devnet runs on
wall-clock time: compress the dates to fit the event.
## PHASE 1 · SUBSCRIPTION
Deposits open, lending blocked.
## PHASE 2 · INVESTMENT
Loans run, deposits and withdrawals blocked.
## PHASE 3 · REDEMPTION
Withdrawals open, new lending blocked.
## MINIMUM BAR · BOTH FLAVOURS
## 01
Create a closed-ended vault, dates compressed to the event
## 02
Deposit capital during the Subscription phase
## 03
In Investment, originate and fund a loan whose final payment falls before
RedemptionDate
## 04
In Redemption, withdraw capital plus accrued yield
## 05
Show rejected VaultDeposit and VaultWithdraw during Investment
## 06
Show a rejected LoanSet during Redemption
Use cases, or bring your own. Fixed-income pool · private credit fund · seasonal or campaign financing · impairment and default under lock-up.
## 04

## EVERY TRACK, TWO FLAVOURS
Vanilla or Loaded, picked at submission
## VANILLA
The baseline, done well
XLS65 and XLS66 on their own, with a credible use case
around them.
## LOADED
The baseline, plus one primitive
Couple the lending stack with at least one other ledger
primitive and report where the seams are: Permissioned
Domains and Credentials, TokenEscrow, sponsored fees and
reserves, MPTs.
Loaded is not scored higher by default. A well-executed Vanilla build with a sharp report beats a Loaded build that composes two
primitives badly and tells us nothing about why.
## 05

## JUDGING
Presentation and submission
5 min presentation + live demo · 3 min Q&A
Cover the use case and why it makes sense, a live demo on
Devnet, your top three friction points with proposals, and
anything you contributed back.
## Requirements
Working implementation on Devnet · public GitHub repo with
setup steps · demonstrated on-chain transactions · slide deck, 10
slides max.
Structured feedback report · mandatory
## 01
Automated devex collection via the Agentic Hook · github.com/RippleDevRel/xrpl-devex-hook
## 02
Manual developer report, max 3 pages: your personal experience, in your own words.
Security issue? Tell a mentor privately before presenting, it will not cost you points.
## 06

## WHY WE ARE HERE
Developer feedback is what matters to us
All information is in the Notion
## 01 · AUTOMATED
## Agentic Hook
Install the hook and it collects devex signals automatically
while you build: failed submits, retries, doc lookups. Zero
extra work during the event.
github.com/RippleDevRel/xrpl-devex-hook
## 02 · MANUAL
Developer report, max 3 pages
Written by you, not generated. Your personal take on the
journey: where the protocol fought you, what surprised you,
and the improvements and fixes you would propose.
A sharp, specific report beats a polished demo that tells us
nothing.
## 07

## JUDGING CRITERIA
How we score
## 40%
Developer feedback
quality
Docs, SDK, wallets, AI tooling:
cite the exact spot, propose
the fix. Proposals score above
flagging.
## 30%
Technical execution on
## XRPL
Non-trivial use of XLS65/66,
verifiable transactions on
## Devnet.
## 20%
Creativity and use case
An original angle: a lending
story that would go live and
get traction, or a missing
developer tool.
## 10%
## Presentation
A clear story and a live demo
that runs.
## BONUS
Contribution back. A PR, a docs correction, a reusable code sample, a reference implementation.
## 08

## PRIZES
$10,000 on the table
## $5,000
Cash prize pool
Distributed across the top four teams, graduated from 1st to
4th place.
## $5,000
Swell travel grant
Split between the two best teams to attend Swell, Ripple's
annual conference.
## 09
## $2,000 First Prize
## $1,500 Second Prize
## $1,000 Third Prize
## $500 Fourth Prize
$2,500 for the top two teams

Full challenge statement and
resources
Tracks, minimum bars, report questions, tooling: it is all in the Notion.
## 10