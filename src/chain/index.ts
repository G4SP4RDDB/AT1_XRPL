// Public surface of the chain layer. Person B calls only this (directly or via server.ts).
// Every function is documented in docs/chain-api.md.
import type { Bid, TxReceipt, WithdrawRequest, Blocked } from "../../shared/types.js";
import * as ops from "./ops.js";
export { read } from "./readLayer.js";

export const tx = {
  createBond: (bid: Bid) => ops.createBond(bid),
  deposit: (lenderAddress: string, vaultId: string, amount: string): Promise<TxReceipt> => ops.deposit(lenderAddress, vaultId, amount),
  originate: (bid: Bid) => ops.originate(bid),
  payCoupon: (loanId: string, borrowerAddress: string): Promise<TxReceipt | Blocked> => ops.payCoupon(loanId, borrowerAddress),
  withdraw: (req: WithdrawRequest): Promise<TxReceipt> => ops.withdraw(req),
  finalRepayment: (loanId: string, borrowerAddress: string): Promise<TxReceipt | Blocked> => ops.finalRepayment(loanId, borrowerAddress),
  impair: (loanId: string): Promise<TxReceipt> => ops.impair(loanId),
  unimpair: (loanId: string): Promise<TxReceipt> => ops.unimpair(loanId),
  registerWallet: (seed: string) => ops.registerWallet(seed),
};
