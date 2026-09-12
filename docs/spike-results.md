# Spike results, lifecycle run 2026-09-12T16:11:23.740Z

vault 15087B6883772F5636D2E2D679C5D13ADA2E81E0AE6DD19023B73CDBC2CC3BDA  broker B0C61E38BD6D5FEEC89A8B8D32227CCF273C521BAAD40C3549BEB0516B731D61  loan -

| step | result | hash | note |
|---|---|---|---|
| 1 VaultCreate (broker) | tesSUCCESS | [254E1E6DAB](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/254E1E6DABB9E782F3F01D60789E90B0A6B9393D91EE66C47495B7D8F44E5B08) | vaultId 15087B6883 |
| 2 LoanBrokerSet (broker) | tesSUCCESS | [1D6E18ABD5](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/1D6E18ABD58A154F9D811CE99258EA403248B4D976FCA348A152A626B736D807) | loanBrokerId B0C61E38BD |
| 2b LoanBrokerCoverDeposit 150 XRP | tesSUCCESS | [7E925621FD](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/7E925621FDCE03CFF0B3049A381FA1599101438218836AA5986F3489FE8D7B0E) |  |
| 3 VaultDeposit 1000 XRP (lender1) | tecINSUFFICIENT_FUNDS | [90E991C72D](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/90E991C72D74DA190ED26204079BAF47D823F560723223EDBEA57E4BE290CB79) | shares=0 total=0 avail=0 pps=0 |
| 4 SignerListSet quorum 2 (borrower) | tesSUCCESS | [B161535ED0](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/B161535ED04D98D2AC759BDC034F9E45DF4F9EB90D786BA715B5E0F6C2C6BF97) | op=r9R6xDba enf=rszaxP85 |
| 4b AccountSet asfDisableMaster | tesSUCCESS | [156E93838C](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/156E93838CE90407E0FBD68CE008AD63566751C1B0224646BD5325453887ABD5) |  |
| 4c Payment signed by master (expect reject) | tefMASTER_DISABLED |  |  |
| 5 LoanSet, counterparty Signers[2] | error: fails local checks: Counterparty: Duplicate Signers not allowed. |  | loanId undefined borrower=999.999976 XRP total=0 avail=0 pps=0 |

# Spike results, lifecycle run 2026-09-12T16:46:20.644Z

vault 578E44F97AD46C63EB8D3091E19954962C808530631047D26761779A2DFD1C35  broker B5A39B091CE2BD97DF25046D353922B8CD3DADEE12038D37E82F600715349E76  loan 7C54F261C6FDB20EFAA708472455B044E27904BA45658A4824843C4D8899E3AC

| step | result | hash | note |
|---|---|---|---|
| 1 VaultCreate (broker) | tesSUCCESS | [0A3E40B9BA](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/0A3E40B9BA0A1968A300207E8C6E0B895510CCBA905ADC14B4746039C2E5D991) | vaultId 578E44F97A |
| 2 LoanBrokerSet (broker) | tesSUCCESS | [FBCB607894](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/FBCB6078942E8FBE9EDE41DBB766565E37DFD7CC60FEE413F01D50C35A1DA74C) | loanBrokerId B5A39B091C |
| 2b LoanBrokerCoverDeposit 150 XRP | tesSUCCESS | [2F40165D5F](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/2F40165D5FE5EBBC3A65B8598A7671762D6EA1BEAD071E28D9070255E7CAD647) |  |
| 3a top-up lender1 +900 XRP from spare2 | tesSUCCESS | [C590734454](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C590734454E21E1E88D99E32A26AF6B6678E333402BF010F170D93CEF53ED502) | was 999.999988 XRP |
| 3 VaultDeposit 1000 XRP (lender1) | tesSUCCESS | [CB661D0889](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/CB661D0889389E763BBD32D38F326CFA2553ED15AA0C8EF2BF6465B3098609C7) | shares=1000000000 total=1000000000 avail=1000000000 pps=1 |
| 4 SignerListSet quorum 2 (borrower) | skipped: already multisig |  | op=r9R6xDba enf=rszaxP85 |
| 4b AccountSet asfDisableMaster | skipped: already disabled |  |  |
| 4c Payment signed by master (expect reject) | tefMASTER_DISABLED |  |  |
| 5 LoanSet, counterparty Signers[2] | tesSUCCESS | [9049D4BC73](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/9049D4BC738EF092530B778E2E4AC1C028553FBD24D5B1071CA7BEC69303C8DD) | loanId 7C54F261C6 borrower=1999.999976 XRP total=1000000000 avail=0 pps=1 |
| 6 VaultWithdraw ALL shares (expect reject) | tecINSUFFICIENT_FUNDS | [B459D9AAF7](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/B459D9AAF78A6388A4887D04109DAE57471EE4858A85D15B2D702F4099433491) | avail=0 |
| 7 LoanPay coupon, 2 of 2, early | tesSUCCESS | [4434E33720](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/4434E33720D17243D79B46EF5EA159999ED493E312A17CCF98EAFC237760AB25) | amount=333337139 total=1000005652 avail=333337082 pps=1.000005652 remaining=2 |
| 8 LoanPay with 1 signature (expect reject) | tefBAD_QUORUM |  |  |
| 9 VaultWithdraw yield-only shares | tesSUCCESS | [DA751BFB18](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/DA751BFB188B0153B58115BD2ED75002975156669426B118F424251BFE016A15) | held=1000000000 principalShares=999994348.03 yieldShares=5651 avail=333331431 |
| 10 LoanManage tfLoanImpair (broker) | tecTOO_SOON | [E69143C182](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/E69143C1822CFC007D604AC0ACCCA1EAA3C3B1D1DF388E2DFB045DE66F8B0971) | lossUnrealized=0 pps=1.0000056520319396 |
| 10b LoanManage tfLoanUnimpair | tecNO_PERMISSION | [3CA1EDC1FD](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/3CA1EDC1FD582589021F6906359E935B5A5DEA16183F41CC0AF34154FE7799D3) | lossUnrealized=0 pps=1.0000056520319396 |
| 11 LoanPay tfLoanFullPayment early, 2 of 2 | tesSUCCESS | [685A52185C](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/685A52185C452E88211FDB24BD63E196F56555B04EC4F74E4A12E34A79DCA6F3) | offered=681001942 cost=674.335291 XRP total=1006600020 avail=1006600020 pps=1.0066057083288578 |
| 12 VaultWithdraw all shares after close | tesSUCCESS | [28610CA12E](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/28610CA12E540D576C994098829AC96659C6DD15D12F854FE4B6EFB93AC92935) | shares=999994349 lender +1006.600008 XRP total=0 |

