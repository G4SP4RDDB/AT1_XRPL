// The broker's enforcer seat on the borrower multisig. Holds its own key (.enforcer.env, never .env)
// and co-signs a borrower transaction only when the policy passes (pipeline §11, decision 2):
//   1. it is a LoanPay on a loan whose broker we own;
//   2. tfLoanFullPayment only once the call date (StartDate + PaymentInterval x PaymentTotal) has passed;
//   3. a coupon Amount must equal the loan's current PeriodicPayment + LoanServiceFee, rounded up;
//   4. otherwise sign.
import fs from "node:fs";
import path from "node:path";
import { Wallet, type Client } from "xrpl";
import { ledgerEntry, ledgerCloseTime } from "../read.js";

const TF_FULL = 0x00020000;
const TF_LATE = 0x00040000;

export type BlockedReason =
  | "before-call-date"
  | "wrong-amount"
  | "not-loan-pay"
  | "unauthorized-principal-withdrawal"
  | "not-supported";

export type CosignResult = { ok: true; blob: string } | { ok: false; blocked: BlockedReason; reason: string };
export type Decision = { ok: true } | { ok: false; blocked: BlockedReason; reason: string };

let key: Wallet | undefined;
export function enforcerWallet(): Wallet {
  if (key) return key;
  const file = path.resolve(process.cwd(), ".enforcer.env");
  if (!fs.existsSync(file)) throw new Error("enforcer: .enforcer.env missing (ENFORCER_SEED=...)");
  const m = fs.readFileSync(file, "utf8").match(/^ENFORCER_SEED=(\S+)/m);
  if (!m) throw new Error("enforcer: ENFORCER_SEED not set in .enforcer.env");
  key = Wallet.fromSeed(m[1]);
  return key;
}

/** Last scheduled due date. The Loan entry has no PaymentTotal, so derive it from the next due date and what remains. */
export function callDateRipple(loan: any): number {
  const remaining = Number(loan.PaymentRemaining ?? 0);
  if (remaining === 0) return Number(loan.PreviousPaymentDueDate ?? loan.NextPaymentDueDate ?? 0);
  return Number(loan.NextPaymentDueDate) + Number(loan.PaymentInterval) * (remaining - 1);
}

/**
 * The withdrawal policy for lender multisig accounts.
 * - Yield-only withdrawals (requestedShares <= position.yieldShares): co-signed at any time.
 * - Principal withdrawals (requestedShares > position.yieldShares): co-signed ONLY once the underlying loan is closed/settled.
 * - Otherwise rejected with "unauthorized-principal-withdrawal".
 */
export function decideWithdraw(
  prepared: Record<string, any>,
  vault: any,
  loan: any,
  position: any,
  brokerAddress: string
): Decision {
  if (prepared.TransactionType !== "VaultWithdraw") {
    return { ok: false, blocked: "not-supported", reason: `decideWithdraw expects VaultWithdraw, got ${prepared.TransactionType}` };
  }
  const vaultOwner = vault?.brokerAddress ?? vault?.Account ?? vault?.account ?? vault?.Owner ?? vault?.owner;
  if (!vault || (vaultOwner && vaultOwner !== brokerAddress)) {
    return { ok: false, blocked: "not-supported", reason: "vault is not brokered by this platform" };
  }

  const requestedShares = Number(typeof prepared.Amount === "object" ? prepared.Amount?.value : prepared.Amount);
  if (Number.isNaN(requestedShares) || requestedShares <= 0) {
    return { ok: false, blocked: "wrong-amount", reason: `invalid withdrawal share amount: ${JSON.stringify(prepared.Amount)}` };
  }

  const yieldShares = Number(position?.yieldShares ?? 0);
  // Case 1: yield-only redemption is always permitted
  if (requestedShares <= yieldShares) {
    return { ok: true };
  }

  // Case 2: requesting more than yield shares (attempting to redeem principal)
  const paymentRemaining = Number(loan?.PaymentRemaining ?? loan?.paymentRemaining ?? 0);
  const loanStatus = loan?.status ?? (paymentRemaining === 0 ? "closed" : "active");
  const isClosed = !loan || loanStatus === "closed" || paymentRemaining === 0 || loanStatus === "none";

  if (!isClosed) {
    return {
      ok: false,
      blocked: "unauthorized-principal-withdrawal",
      reason: `principal withdrawal locked: loan is ${loanStatus} with ${paymentRemaining} payments remaining (yield-only max: ${yieldShares} shares)`,
    };
  }

  return { ok: true };
}

/** The policy, pure: transaction JSON, the Loan and LoanBroker entries, ledger time, and who we broker for. */
export function decide(
  prepared: Record<string, any>,
  loan: any,
  broker: any,
  now: number,
  brokerAddress: string,
  extra?: { position?: any; vault?: any; loan?: any }
): Decision {
  if (prepared.TransactionType === "VaultWithdraw") {
    return decideWithdraw(prepared, extra?.vault ?? loan, extra?.loan, extra?.position, brokerAddress);
  }
  if (prepared.TransactionType !== "LoanPay") {
    return { ok: false, blocked: "not-loan-pay", reason: `enforcer only co-signs LoanPay and VaultWithdraw, got ${prepared.TransactionType}` };
  }
  if (!loan || !broker || broker.Owner !== brokerAddress) {
    return { ok: false, blocked: "not-loan-pay", reason: "loan is not brokered by this platform" };
  }
  const flags = Number(prepared.Flags ?? 0);
  if (flags & TF_FULL) {
    const callDate = callDateRipple(loan);
    if (now < callDate) {
      return { ok: false, blocked: "before-call-date", reason: `call date in ${callDate - now}s (ledger time ${now}, call ${callDate})` };
    }
  } else {
    const base = Math.ceil(Number(loan.PeriodicPayment) + Number(loan.LoanServiceFee ?? 0));
    const late = now > Number(loan.NextPaymentDueDate);
    if (late) {
      // Overdue: the ledger requires tfLoanLatePayment and charges late fee + late interest computed at close time,
      // so the exact figure is not knowable in advance; the ledger takes only what is due from a larger Amount.
      const floor = base + Math.ceil(Number(loan.LatePaymentFee ?? 0));
      if (!(flags & TF_LATE) || Number(prepared.Amount) < floor) {
        return { ok: false, blocked: "wrong-amount", reason: `payment is overdue: needs tfLoanLatePayment and at least ${floor} drops` };
      }
    } else if (flags & TF_LATE || String(prepared.Amount) !== String(base)) {
      return { ok: false, blocked: "wrong-amount", reason: `coupon must be exactly ${base} drops with no flags, got ${prepared.Amount}` };
    }
  }
  return { ok: true };
}

/** Decide against the live ledger, then sign. `prepared` is the autofilled transaction JSON the operator also signs. */
export async function cosign(client: Client, prepared: Record<string, any>, brokerAddress: string): Promise<CosignResult> {
  if (prepared.TransactionType === "LoanPay") {
    const loan = prepared.LoanID ? await ledgerEntry(client, prepared.LoanID).catch(() => undefined) : undefined;
    const broker = loan?.LoanBrokerID ? await ledgerEntry(client, loan.LoanBrokerID).catch(() => undefined) : undefined;
    const now = await ledgerCloseTime(client);
    const d = decide(prepared, loan, broker, now, brokerAddress);
    if (!d.ok) return d;
    const signed = enforcerWallet().sign(prepared as any, true);
    return { ok: true, blob: signed.tx_blob };
  }

  if (prepared.TransactionType === "VaultWithdraw") {
    const { vaultStateOf, positionOf } = await import("../readLayer.js");
    const vault = prepared.VaultID ? await vaultStateOf(client, prepared.VaultID).catch(() => undefined) : undefined;
    const position = (prepared.VaultID && prepared.Account)
      ? await positionOf(client, prepared.Account, prepared.VaultID).catch(() => undefined)
      : undefined;
    const d = decideWithdraw(prepared, vault, vault?.loan, position, brokerAddress);
    if (!d.ok) return d;
    const signed = enforcerWallet().sign(prepared as any, true);
    return { ok: true, blob: signed.tx_blob };
  }

  return { ok: false, blocked: "not-loan-pay", reason: `enforcer does not support ${prepared.TransactionType}` };
}
