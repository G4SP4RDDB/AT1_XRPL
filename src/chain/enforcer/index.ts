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

export type CosignResult = { ok: true; blob: string } | { ok: false; blocked: "before-call-date" | "wrong-amount" | "not-loan-pay"; reason: string };
export type Decision = { ok: true } | { ok: false; blocked: "before-call-date" | "wrong-amount" | "not-loan-pay"; reason: string };

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

/** The policy, pure: transaction JSON, the Loan and LoanBroker entries, ledger time, and who we broker for. */
export function decide(prepared: Record<string, any>, loan: any, broker: any, now: number, brokerAddress: string): Decision {
  if (prepared.TransactionType !== "LoanPay") {
    return { ok: false, blocked: "not-loan-pay", reason: `enforcer only co-signs LoanPay, got ${prepared.TransactionType}` };
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

/** Decide against the live ledger, then sign. `prepared` is the autofilled transaction JSON the borrower-op also signs. */
export async function cosign(client: Client, prepared: Record<string, any>, brokerAddress: string): Promise<CosignResult> {
  const loan = prepared.LoanID ? await ledgerEntry(client, prepared.LoanID).catch(() => undefined) : undefined;
  const broker = loan?.LoanBrokerID ? await ledgerEntry(client, loan.LoanBrokerID).catch(() => undefined) : undefined;
  const now = await ledgerCloseTime(client);
  const d = decide(prepared, loan, broker, now, brokerAddress);
  if (!d.ok) return d;
  const signed = enforcerWallet().sign(prepared as any, true);
  return { ok: true, blob: signed.tx_blob };
}
