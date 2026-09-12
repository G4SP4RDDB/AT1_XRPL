import type { VaultState, Position, TxReceipt } from "../../shared/types.js";

const callDate = new Date(Date.now() + 9 * 60_000).toISOString();

export const vaultFixture: VaultState = {
  vaultId: "STUB0000000000000000000000000000000000000000000000000000000000AA",
  asset: "XRP",
  assetsTotal: "1010",
  assetsAvailable: "10",
  lossUnrealized: "0",
  sharesTotal: "1000",
  pps: 1.01,
  callDate,
  loan: {
    loanId: "STUB0000000000000000000000000000000000000000000000000000000000BB",
    principalOutstanding: "1000",
    totalValueOutstanding: "1020",
    periodicPayment: "340",
    nextPaymentDueDate: new Date(Date.now() + 3 * 60_000).toISOString(),
    paymentRemaining: 2,
    status: "active",
  },
  stub: true,
};

export const positionFixture: Position = {
  depositorAddress: "rD8F37f4XEpNMfCmSUDerZiSBSG8rD1QzZ",
  vaultId: vaultFixture.vaultId,
  shares: "1000",
  principalDeposited: "1000",
  currentValue: "1010",
  accruedYield: "10",
  yieldShares: "9",
  stub: true,
};

export const receiptFixture = (tag: string): TxReceipt => ({
  hash: `STUB${tag.toUpperCase()}`.padEnd(64, "0"),
  result: "tesSUCCESS",
  explorerUrl: "https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/",
  stub: true,
});
