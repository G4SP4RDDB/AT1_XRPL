# End-to-end pipeline run — 2026-09-12T21:12:43.898Z

Bond: 200 XRP, 100% annual, vault `423CA47C7258C6DAC0E3C8C4D58B2B7CB1AFC898FB212679CCA9A23C4821BB55`, loan `BCFF9885775BA477A92369486C0FC42CE0EA5B85B362C7F22499CE65A543C5B0`.
16/16 steps matched expectation.

| # | Step | Expected | Got | Hash | Note |
|---|---|---|---|---|---|
| 1 | VaultCreate | `tesSUCCESS` | `tesSUCCESS` | [C8B24C23A2](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C8B24C23A2D0499ACE61281E97DCCBC288BFC7711DCBA721CB9DBC60E591A9CC) |  |
| 2 | LoanBrokerSet | `tesSUCCESS` | `tesSUCCESS` | [C093128A26](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C093128A266EE66091CFF3EEEBCB170175221DCDC6C095DDA656E85AE8960C6B) |  |
| 3 | LoanBrokerCoverDeposit | `tesSUCCESS` | `tesSUCCESS` | [CCEA07B7C4](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/CCEA07B7C4387ECD4666476E8C22952F73ABE2F0F49952F832EFA363452CE429) |  |
| 4 | VaultDeposit lender1 200 XRP | `tesSUCCESS` | `tesSUCCESS` | [BA2C86E975](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/BA2C86E975C6B07349215D05FA39E58BEE9BEDAB7261F7A31DC79E438F3E9177) |  |
| 5 | Payment signed by disabled master key | `tefMASTER_DISABLED` | `tefMASTER_DISABLED` | — |  |
| 6 | LoanSet, counterparty Signers[2] | `tesSUCCESS` | `tesSUCCESS` | [23AA66A740](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/23AA66A74042F4C4EC5A3ABDCACA90B9CD4715D371A01031D2DD186DDDD17ED8) | loanId BCFF988577 |
| 7 | LoanManage tfLoanImpair, not yet due | `tecTOO_SOON` | `tecTOO_SOON` | [34AE03134F](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/34AE03134F37ACF3C3B87AB0A5941E1AE755933662E07153F7B6FEE01CE7C13C) |  |
| 8 | VaultWithdraw full (guardrail) | `tecINSUFFICIENT_FUNDS` | `tecINSUFFICIENT_FUNDS` | [C4240633AC](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C4240633AC9E52509C00370466BE8838F05B53F7DA28B61BC31D4FBA4016C1AF) |  |
| 9 | finalRepayment, paymentRemaining=3 | `blocked:before-call-date` | `blocked:before-call-date` | — |  |
| 10 | LoanPay, 1 of 2 signatures | `tefBAD_QUORUM` | `tefBAD_QUORUM` | — |  |
| 11 | LoanManage tfLoanImpair, overdue | `tesSUCCESS` | `tesSUCCESS` | [7978F00413](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/7978F00413D38372CB2757B46CB31A41D336A186B2297C9B907E8AC11BBD83B5) |  |
| 12 | LoanManage tfLoanUnimpair | `tesSUCCESS` | `tesSUCCESS` | [8BB3ECA9B9](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/8BB3ECA9B954F13AFE386ECD03954E91397016236203D6EC4E83654D9C13E4A1) |  |
| 13 | LoanPay coupon #1 (late) | `tesSUCCESS` | `tesSUCCESS` | [5F2A407308](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/5F2A4073080377786571A24CD2AD0B5DE334BB008871C477FDD998EE0B1211B6) |  |
| 14 | VaultWithdraw yield-only | `tesSUCCESS` | `tesSUCCESS` | [0224724B4D](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/0224724B4DA69A92D01D1EDA54FD13DB1D7D79520407E706C039F195E760D234) |  |
| 15 | finalRepayment at the call date (early close, tfLoanFullPayment) | `tesSUCCESS` | `tesSUCCESS` | [EA805215F3](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/EA805215F309CCC1F22A209B3B01328E351BE9EB1F73B5F90447E816D947994E) |  |
| 16 | VaultWithdraw all shares | `tesSUCCESS` | `tesSUCCESS` | [99A7BB682D](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/99A7BB682D4A772B4A2F8FF461E556DE8D8EC4A33BBED51E5EA56BF76024A7BF) |  |
