# End-to-end pipeline run — 2026-09-13T09:09:05.821Z

Bond: 200 XRP, 100% annual, vault `8CA5B51F5549027B561EC807392AC7AF3E55ABDE05B0A80F157B4BDD3541D55E`, loan `C918A67F5421BE1E3E1251A5ED7AE25A8FFF6E89DCD28026153BC590950C5F5C`.
17/17 steps matched expectation.

| # | Step | Expected | Got | Hash | Note |
|---|---|---|---|---|---|
| 1 | VaultCreate | `tesSUCCESS` | `tesSUCCESS` | [9805777345](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/980577734513482A6C5F4907838FFF8CC730D0E14139491F53FC4DB06FD4CCCA) |  |
| 2 | LoanBrokerSet | `tesSUCCESS` | `tesSUCCESS` | [0CD58B43E5](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/0CD58B43E5A0711A44D9633EAA56519F6973FC5D707628D055EBD54B5E42AB2B) |  |
| 3 | LoanBrokerCoverDeposit | `tesSUCCESS` | `tesSUCCESS` | [111DEB0A51](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/111DEB0A516809043A575E8EC8E445E0990FBB5D40701C6515DC4946575EB28F) |  |
| 4 | VaultDeposit lender1 200 XRP | `tesSUCCESS` | `tesSUCCESS` | [C0ECA725EF](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C0ECA725EFFAB3B7813014B89E97B1B6584BD72A27CF5DE9B943CB357113231E) |  |
| 5 | Payment signed by disabled master key | `tefMASTER_DISABLED` | `tefMASTER_DISABLED` | — |  |
| 6 | LoanSet auto-originated by the funding deposit | `tesSUCCESS` | `tesSUCCESS` | [13BD51C521](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/13BD51C521276B5F058880C4A904CAE221900C310C82A3FFC10138923A1679E4) | loanId C918A67F54 |
| 7 | LoanSet with a foreign counterparty | `blocked:not-issuer` | `blocked:not-issuer` | — |  |
| 8 | LoanManage tfLoanImpair, not yet due | `tecTOO_SOON` | `tecTOO_SOON` | [92D7F9C9DC](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/92D7F9C9DC54692EA58775E37ADF44D90C08E78DE20B2048A7A5F9853C9929BB) |  |
| 9 | VaultWithdraw full (guardrail) | `tecINSUFFICIENT_FUNDS` | `tecINSUFFICIENT_FUNDS` | [E43360B573](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/E43360B57339F8798A92BA179CDFA5F8FC05ABBF62CCC97A32D49154F87D71B7) |  |
| 10 | finalRepayment, paymentRemaining=3 | `blocked:before-call-date` | `blocked:before-call-date` | — |  |
| 11 | LoanPay, 1 of 2 signatures | `tefBAD_QUORUM` | `tefBAD_QUORUM` | — |  |
| 12 | LoanManage tfLoanImpair, overdue | `tesSUCCESS` | `tesSUCCESS` | [04E8DC5E44](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/04E8DC5E44D5B070D9DA6E345C0E5518193C95116A19CD8A4E1A52BCCEB0C0D2) |  |
| 13 | LoanManage tfLoanUnimpair | `tesSUCCESS` | `tesSUCCESS` | [A997BC778F](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/A997BC778F2A52DA136C6838441FDC3E10B327410828A5F90D64470F2E60C042) |  |
| 14 | LoanPay coupon #1 (late) | `tesSUCCESS` | `tesSUCCESS` | [32606E7E79](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/32606E7E79C0094253A109A6AA41B263E2FB9F549B58D5764968B0DC0958E5D5) |  |
| 15 | VaultWithdraw yield-only | `tesSUCCESS` | `tesSUCCESS` | [AC398BCDD3](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/AC398BCDD3DC2F865A58BA6BBA6CE969389514A26965A976B7253A5DC8C05293) |  |
| 16 | finalRepayment at the call date (remaining coupons, tfLoanLatePayment) | `tesSUCCESS` | `tesSUCCESS` | [8FF45F30B6](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/8FF45F30B620EA9399356BE1F9CAE0813CBDC74644AFA93B1F81CCB1C8429407) |  |
| 17 | VaultWithdraw all shares | `tesSUCCESS` | `tesSUCCESS` | [FD8835CBF7](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/FD8835CBF79C4F4716E349E511E7235883F0027B684E27FA38567B0C0173816F) |  |
