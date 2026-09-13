// Public surface of the chain layer. Person B calls only this (directly or via server.ts).
// Every function is documented in docs/chain-api.md.
import type { Bid, TxReceipt, WithdrawRequest, Blocked, AccountRole } from "../../shared/types.js";
import * as ops from "./ops.js";
export { read } from "./readLayer.js";

export const tx = {
  createBond: (bid: Bid) => ops.createBond(bid),
  // VaultDeposit is signed by the lender's own external wallet, not this backend: prepare returns
  // an unsigned, autofilled transaction; submitSigned takes back the blob once they've signed it.
  prepareDeposit: (lenderAddress: string, vaultId: string, amount: string) => ops.prepareDeposit(lenderAddress, vaultId, amount),
  submitSigned: (signedBlob: string): Promise<TxReceipt> => ops.submitSigned(signedBlob),
  originate: (bid: Bid) => ops.originate(bid),
  payCoupon: (loanId: string, borrowerAddress: string): Promise<TxReceipt | Blocked> => ops.payCoupon(loanId, borrowerAddress),
  withdraw: (req: WithdrawRequest): Promise<TxReceipt | Blocked> => ops.withdraw(req),
  prepareWithdraw: (req: WithdrawRequest) => ops.prepareWithdraw(req),
  finalRepayment: (loanId: string, borrowerAddress: string): Promise<TxReceipt | Blocked> => ops.finalRepayment(loanId, borrowerAddress),
  impair: (loanId: string): Promise<TxReceipt> => ops.impair(loanId),
  unimpair: (loanId: string): Promise<TxReceipt> => ops.unimpair(loanId),
  depositCover: (loanBrokerId: string, amount: string): Promise<TxReceipt> => ops.depositCover(loanBrokerId, amount),
  // Multisig setup is also externally signed: prepare returns the two plain transactions for the
  // account owner's own wallet to sign, submit takes back both blobs.
  prepareAccountMultisigSetup: (accountAddress: string) => ops.prepareAccountMultisigSetup(accountAddress),
  submitAccountMultisigSetup: (accountAddress: string, signerListSetBlob: string, disableMasterBlob: string): Promise<TxReceipt> =>
    ops.submitAccountMultisigSetup(accountAddress, signerListSetBlob, disableMasterBlob),
  updateAccount: (params: { address: string; role?: AccountRole; name?: string; company?: string; firstName?: string; userRole?: string; multisigActive?: number }) => ops.updateDbAccount(params),
  wipeCreatedAccounts: async () => {
    ops.wipeCreatedAccounts();
    return { success: true };
  },
};

