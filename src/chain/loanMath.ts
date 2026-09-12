// XLS-66 amortisation, client side (Appendix A-1 / A-2). All amounts in drops, rates in 1/10 bp.
import { SECONDS_PER_YEAR } from "./config.js";

export const periodicRate = (interestRate: number, paymentIntervalSec: number) =>
  (interestRate / 100_000) * paymentIntervalSec / SECONDS_PER_YEAR;

/** Constant payment per period (formula 7). */
export function periodicPayment(principalDrops: number, interestRate: number, paymentIntervalSec: number, paymentsRemaining: number): number {
  const r = periodicRate(interestRate, paymentIntervalSec);
  if (r === 0) return principalDrops / paymentsRemaining;
  const raised = Math.pow(1 + r, paymentsRemaining);
  return principalDrops * (r * raised) / (raised - 1);
}

/** Total interest over the life of the loan, gross of the management fee. */
export function totalInterest(principalDrops: number, interestRate: number, paymentIntervalSec: number, paymentTotal: number): number {
  return periodicPayment(principalDrops, interestRate, paymentIntervalSec, paymentTotal) * paymentTotal - principalDrops;
}

/** yieldRate in percent per year (8.5) -> ledger units (1/10 bp), clamped to the protocol max. */
export const percentToTenthBp = (pct: number) => Math.max(0, Math.min(100_000, Math.round(pct * 1000)));

export const RIPPLE_EPOCH = 946_684_800;
export const rippleToIso = (t: number) => (Number.isFinite(t) && t > 0 ? new Date((t + RIPPLE_EPOCH) * 1000).toISOString() : "");
export const isoToRipple = (iso: string) => Math.floor(new Date(iso).getTime() / 1000) - RIPPLE_EPOCH;
