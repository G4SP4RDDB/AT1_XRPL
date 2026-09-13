# End-to-end pipeline run — 2026-09-13T08:32:46.735Z

Bond: 200 XRP, 100% annual, vault `4E503A3384873782165EF15B76FF06072FB8C43C0DCDBD7949A6A279CDB997F6`, loan `45326FE5B828B4D0C1E6067E60A02EE58FF237239A57096125DB5D8D4373106B`.
17/17 steps matched expectation.

| # | Step | Expected | Got | Hash | Note |
|---|---|---|---|---|---|
| 1 | VaultCreate | `tesSUCCESS` | `tesSUCCESS` | [AD3FA56724](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/AD3FA56724EB2C3664B60DBF3FE3AA57FAB87FBD52519B635E92E62E81C8C8BC) |  |
| 2 | LoanBrokerSet | `tesSUCCESS` | `tesSUCCESS` | [BCC15292C1](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/BCC15292C1C4C07B30A2E486D98C09BDE03873F7BD335E6C7037ED8EEC2F588F) |  |
| 3 | LoanBrokerCoverDeposit | `tesSUCCESS` | `tesSUCCESS` | [32B59B979C](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/32B59B979CA62B8767464F377AD1469CD7C197AB699BE0DA169AE4527A81AAE0) |  |
| 4 | VaultDeposit lender1 200 XRP | `tesSUCCESS` | `tesSUCCESS` | [3FA9CF4577](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/3FA9CF457753295929C390DA8A35007E2392B385F02450BFA12E502D574F5C20) |  |
| 5 | Payment signed by disabled master key | `tefMASTER_DISABLED` | `tefMASTER_DISABLED` | — |  |
| 6 | LoanSet auto-originated by the funding deposit | `tesSUCCESS` | `tesSUCCESS` | [AD5AAC42DD](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/AD5AAC42DD90BCE97B8ACF3DB959B90A87C2CD3B09AD9AEC3B9C1D985FEBF5C0) | loanId 45326FE5B8 |
| 7 | LoanSet with a foreign counterparty | `blocked:not-issuer` | `blocked:not-issuer` | — |  |
| 8 | LoanManage tfLoanImpair, not yet due | `tecTOO_SOON` | `tecTOO_SOON` | [E8921F7721](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/E8921F772154D4483688D259B0FEF08735F6B1A09944B9465EC317F8F7C84DAD) |  |
| 9 | VaultWithdraw full (guardrail) | `tecINSUFFICIENT_FUNDS` | `tecINSUFFICIENT_FUNDS` | [C64485D302](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C64485D302472C0636D6CDCCFB3F726CE1B54855824B6BCEE36E52B6C11930C0) |  |
| 10 | finalRepayment, paymentRemaining=3 | `blocked:before-call-date` | `blocked:before-call-date` | — |  |
| 11 | LoanPay, 1 of 2 signatures | `tefBAD_QUORUM` | `tefBAD_QUORUM` | — |  |
| 12 | LoanManage tfLoanImpair, overdue | `tesSUCCESS` | `tesSUCCESS` | [14ACE5F538](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/14ACE5F538B43521097219AD3958A879AAA5DFDF4E718784384C00584EAA6770) |  |
| 13 | LoanManage tfLoanUnimpair | `tesSUCCESS` | `tesSUCCESS` | [B2B7BFD564](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/B2B7BFD564EA1D6E1AEA20736AC6860E15446D1D7055D344C26CAC2DA683A110) |  |
| 14 | LoanPay coupon #1 (late) | `tesSUCCESS` | `tesSUCCESS` | [5AD7702137](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/5AD7702137B7BDFE09FC5184BCCF903C04AD6DD0B491D3E282790F52EC555970) |  |
| 15 | VaultWithdraw yield-only | `tesSUCCESS` | `tesSUCCESS` | [CB494E5BBC](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/CB494E5BBC7C2313754D4C868C13FFCDAC79A70C9972B665C7CC87A357D3EE15) |  |
| 16 | finalRepayment at the call date (remaining coupons, tfLoanLatePayment) | `tesSUCCESS` | `tesSUCCESS` | [01AEABF9D5](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/01AEABF9D5595C47CD6A2186529E60139D51803D2406199C41F0C631B4AB9DD7) |  |
| 17 | VaultWithdraw all shares | `tesSUCCESS` | `tesSUCCESS` | [5E28EFD752](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/5E28EFD752CE2548055E4924AF34FA4636683292656CB90BA943BCD0CC09C194) |  |
