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

