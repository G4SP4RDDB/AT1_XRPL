# End-to-end pipeline run — 2026-09-13T07:13:54.858Z

Bond: 200 XRP, 100% annual, vault `407F2EB03214AC2043DE5ADE61827D9AC9E422E25CA3731EDEFA3B358A6ED277`, loan `8409C72D89D8E4C9129070C80E23AEAA78749C24AF3B7D7FAA35F68808BAAFFE`.
17/17 steps matched expectation.

| # | Step | Expected | Got | Hash | Note |
|---|---|---|---|---|---|
| 1 | VaultCreate | `tesSUCCESS` | `tesSUCCESS` | [C0467931A2](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C0467931A24F29878FCD17EA581B7E928BAE03E37D8F2FD1AA06CBC2D9FD660B) |  |
| 2 | LoanBrokerSet | `tesSUCCESS` | `tesSUCCESS` | [AA90469ECF](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/AA90469ECF96AE272873402DDCC6A7822FC88B5DED1F768485CDC13F2D3516A5) |  |
| 3 | LoanBrokerCoverDeposit | `tesSUCCESS` | `tesSUCCESS` | [B9246233C4](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/B9246233C4BF1C28909956F714378A598F47412EFD90BDADC44C30C6BD83A875) |  |
| 4 | VaultDeposit lender1 200 XRP | `tesSUCCESS` | `tesSUCCESS` | [D7A5A7264C](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D7A5A7264CC9F84E2BB80D396DF9A9170AF96B56A454AF521A7E989138397BF9) |  |
| 5 | Payment signed by disabled master key | `tefMASTER_DISABLED` | `tefMASTER_DISABLED` | — |  |
| 6 | LoanSet auto-originated by the funding deposit | `tesSUCCESS` | `tesSUCCESS` | [F2FA965241](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/F2FA96524112D63BF116F38877F5B036E0F32BD64F83FC699456054AE664E85C) | loanId 8409C72D89 |
| 7 | LoanSet with a foreign counterparty | `blocked:not-issuer` | `blocked:not-issuer` | — |  |
| 8 | LoanManage tfLoanImpair, not yet due | `tecTOO_SOON` | `tecTOO_SOON` | [383FC43AFE](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/383FC43AFEA8E231C74167DC3E8BDE3A7A5127EB75E144B3B421E5922517D5FE) |  |
| 9 | VaultWithdraw full (guardrail) | `tecINSUFFICIENT_FUNDS` | `tecINSUFFICIENT_FUNDS` | [9C0256F4BE](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/9C0256F4BEC10582BFB91246A9666F3354D81B76120BD13D9469330A398CEE41) |  |
| 10 | finalRepayment, paymentRemaining=3 | `blocked:before-call-date` | `blocked:before-call-date` | — |  |
| 11 | LoanPay, 1 of 2 signatures | `tefBAD_QUORUM` | `tefBAD_QUORUM` | — |  |
| 12 | LoanManage tfLoanImpair, overdue | `tesSUCCESS` | `tesSUCCESS` | [BA9BAD3BA7](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/BA9BAD3BA7B6B8C0D9DEB91D112BEB8D1B4495BC4B24BADBEB267A5E88BBA824) |  |
| 13 | LoanManage tfLoanUnimpair | `tesSUCCESS` | `tesSUCCESS` | [B4360FE6B3](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/B4360FE6B3087272F56DC795A807CED219314E2E452772A078533F5E6B8409A7) |  |
| 14 | LoanPay coupon #1 (late) | `tesSUCCESS` | `tesSUCCESS` | [D65A7354BA](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D65A7354BA1E0023ACCB7BAC57A1B6778D9D6248C942BD38242877B598617317) |  |
| 15 | VaultWithdraw yield-only | `tesSUCCESS` | `tesSUCCESS` | [40DC9D05DE](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/40DC9D05DE73F5F6EEEC5B37A2389FAB38C9DD38C46ADB3235B18D68AA45515D) |  |
| 16 | finalRepayment at the call date (remaining coupons, tfLoanLatePayment) | `tesSUCCESS` | `tesSUCCESS` | [875EDE44E2](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/875EDE44E2A681A0756B87F024FBB7FB70D1A7C1B77124145FA0DD3356485518) |  |
| 17 | VaultWithdraw all shares | `tesSUCCESS` | `tesSUCCESS` | [4B47B90D64](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/4B47B90D6422B9FD417A230E9684D4E7D57D93B775D748395CBFE1F86B90D8FE) |  |
