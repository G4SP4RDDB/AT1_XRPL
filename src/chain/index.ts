// Public surface of the chain layer. Person B calls only this (directly or via server.ts).
// Every function is documented in docs/chain-api.md. Status per function is tracked there.
import type { Bid, Position, TxReceipt, VaultState, WithdrawRequest, Blocked } from "../../shared/types.js";
import { vaultFixture, positionFixture, receiptFixture } from "./fixtures.js";

export const read = {
  async vaultState(vaultId: string): Promise<VaultState> {
    return { ...vaultFixture, vaultId };
  },
  async position(address: string, vaultId: string): Promise<Position> {
    return { ...positionFixture, depositorAddress: address, vaultId };
  },
  async listVaults(): Promise<VaultState[]> {
    return [vaultFixture];
  },
};

export const tx = {
  async createBond(bid: Bid): Promise<{ vaultId: string; loanBrokerId: string; receipts: TxReceipt[] }> {
    return { vaultId: vaultFixture.vaultId, loanBrokerId: vaultFixture.loan!.loanId, receipts: [receiptFixture("vaultcreate"), receiptFixture("brokerset")] };
  },
  async deposit(lenderAddress: string, vaultId: string, amount: string): Promise<TxReceipt> {
    return receiptFixture("deposit");
  },
  async originate(bidId: string): Promise<TxReceipt> {
    return receiptFixture("loanset");
  },
  async payCoupon(loanId: string): Promise<TxReceipt | Blocked> {
    return receiptFixture("coupon");
  },
  async withdraw(req: WithdrawRequest): Promise<TxReceipt> {
    return receiptFixture(req.mode === "full" ? "withdrawfull" : "withdrawyield");
  },
  async finalRepayment(loanId: string): Promise<TxReceipt | Blocked> {
    return { blocked: "before-call-date", reason: "stub: call date not reached" };
  },
  async impair(loanId: string): Promise<TxReceipt> {
    return receiptFixture("impair");
  },
  async unimpair(loanId: string): Promise<TxReceipt> {
    return receiptFixture("unimpair");
  },
};
