# End-to-end pipeline run — 2026-09-13T10:10:18.150Z

Bond: 200 XRP, 100% annual, vault `9D738A6B3748F6D12D008812FC046D6BC683FE7FC1758B749BE55A8A8B9C8B7A`, loan `0A7095C2F2BB52A92F0DF0D0B3345CC1C38DA7685FFA84CC73C381DC5522DC99`.
18/19 steps matched expectation.

| # | Step | Expected | Got | Hash | Note |
|---|---|---|---|---|---|
| 1 | VaultCreate | `tesSUCCESS` | `tesSUCCESS` | [4052C62B8E](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/4052C62B8EEEB6C532287D35CE6094352A7B6D8181F44193E5978A18B996F89D) |  |
| 2 | LoanBrokerSet | `tesSUCCESS` | `tesSUCCESS` | [75B6598A13](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/75B6598A13C38DAEF05DE39BB84410FF9ABD44A7928432DC024178158C0F3A10) |  |
| 3 | LoanBrokerCoverDeposit | `tesSUCCESS` | `tesSUCCESS` | [19A53342AE](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/19A53342AE0C0A92BC7193461D50FAA06E63DF3590A186B54E0B21280BF440BE) |  |
| 4 | VaultDeposit lender1 200 XRP | `tesSUCCESS` | `tesSUCCESS` | [0A5D42DC93](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/0A5D42DC93E3FADE31579298BABA710B77592DA58B5265DCBB0359936C66F9FF) |  |
| 5 | Payment signed by disabled master key | `tefMASTER_DISABLED` | `tefMASTER_DISABLED` | — |  |
| 6 | LoanSet auto-originated by the funding deposit | `tesSUCCESS` | `tesSUCCESS` | [4C427021EB](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/4C427021EBCE1195CD8985AFB1E2FDDD0A4B2E75DEB1C83E25F7F2EAA7E09DDC) | loanId 0A7095C2F2 |
| 7 | LoanSet with a foreign counterparty | `blocked:not-issuer` | `blocked:not-issuer` | — |  |
| 8 | LoanManage tfLoanImpair, not yet due | `tecTOO_SOON` | `tecTOO_SOON` | [C31F1DD029](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C31F1DD029844A6DD0B2AEA6B4C4608114DAED4079FCDDF634741A9CBCCAD469) |  |
| 9 | VaultWithdraw full (guardrail) | `tecINSUFFICIENT_FUNDS` | `tecINSUFFICIENT_FUNDS` | [E24E4209BF](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/E24E4209BF3DAE5DB575A90B235812FECC1FBD99483C047035CF7E7E5992D675) |  |
| 10 | finalRepayment (call the bond) before the call date | `blocked:before-call-date` | `blocked:before-call-date` | — |  |
| 11 | repayPrincipal 50 XRP before the call date | `blocked:before-call-date` | `blocked:before-call-date` | — |  |
| 12 | LoanPay, 1 of 2 signatures | `tefBAD_QUORUM` | `tefBAD_QUORUM` | — |  |
| 13 | LoanManage tfLoanImpair, overdue | `tesSUCCESS` | `tesSUCCESS` | [14F446A6EC](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/14F446A6EC7DEEA305ED78A8C90195C88F1FA71F3BF6088329DEEAEAE3B22608) |  |
| 14 | LoanManage tfLoanUnimpair | `tesSUCCESS` | `tesSUCCESS` | [75E91DCCE9](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/75E91DCCE91CA4D0F845734454B3A0FBE1B52D03CDF98DF703CA16C50D2EF7B8) |  |
| 15 | LoanPay coupon #1 (late) | `tesSUCCESS` | `tesSUCCESS` | [3D0D0B4AB5](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/3D0D0B4AB5E51BFA1947F7CA61C514E0EAB9D34E6587E2E36B9DC38313153098) |  |
| 16 | VaultWithdraw yield-only | `tesSUCCESS` | `tesSUCCESS` | [26ED3E2F26](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/26ED3E2F2623FF3A1F3B9D1038C3D42E3C973308311F0D2FD05607D93BA30140) |  |
| 17 | repayPrincipal 50 XRP at the call date (tfLoanOverpayment) | `tesSUCCESS` | `tecEXPIRED` | [B23D82E99A](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/B23D82E99AFB83C5016B6E3C696A2AED92C3F3074633C17ABCDBB24599CD4472) |  |
| 18 | finalRepayment: the issuer calls the bond (tfLoanFullPayment, close premium to the vault) | `tesSUCCESS` | `tesSUCCESS` | [5EE3BD7D91](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/5EE3BD7D91ED09FE5ECA01DE9BB3F6FBE2E3C9471735895516D985D764596DA4) |  |
| 19 | VaultWithdraw all shares | `tesSUCCESS` | `tesSUCCESS` | [DC4DD7F010](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/DC4DD7F010F7211CB1C5FA7CF1CF03B3021AA7C88F2DB3AF9280A03E58CC90D2) |  |
