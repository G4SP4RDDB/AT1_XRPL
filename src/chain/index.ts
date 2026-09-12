// Public surface of the chain layer. Person B calls only this (directly or via server.ts).
// Every function is documented in docs/chain-api.md.
import type { Bid, TxReceipt, WithdrawRequest, Blocked, AccountRole } from "../../shared/types.js";
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
  depositCover: (loanBrokerId: string, amount: string): Promise<TxReceipt> => ops.depositCover(loanBrokerId, amount),
  setupBorrowerMultisig: (borrowerAddress?: string): Promise<TxReceipt> => ops.setupBorrowerMultisig(borrowerAddress),
  createAccount: (params: { role?: AccountRole; name?: string; company?: string; firstName?: string; userRole?: string }) => ops.createDbAccount(params),
  createRandomAccount: (name?: string) => ops.createRandomAccount(name),
  updateAccount: (params: { address: string; role?: AccountRole; name?: string; company?: string; firstName?: string; userRole?: string; multisigActive?: number }) => ops.updateDbAccount(params),
  // ops.registerWallet is synchronous (in-memory Map); wrap so every tx.* value returns a Promise, as server.ts's shim requires.
  registerWallet: async (seed: string) => ops.registerWallet(seed),
};

