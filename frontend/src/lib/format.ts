// Display helpers for amounts that are tiny on a minutes-long demo bond: interest is annualised
// on the ledger (max 100 %/yr), so three minutes of yield is a few thousand drops. Show drops
// rather than "+0.00 XRP", and enough PPS decimals for the movement to be visible.
export function fmtXrp(value: number | string): string {
  const x = Number(value)
  if (!Number.isFinite(x) || x === 0) return '0 XRP'
  if (Math.abs(x) < 0.01) return `${Math.round(x * 1_000_000).toLocaleString()} drops (${x.toFixed(6)} XRP)`
  return `${x.toLocaleString(undefined, { maximumFractionDigits: 6 })} XRP`
}

export function fmtPps(pps: number): string {
  if (!Number.isFinite(pps)) return '—'
  return Math.abs(pps - 1) < 1e-4 ? pps.toFixed(9) : pps.toFixed(6)
}

/** Local datetime-local input value (YYYY-MM-DDTHH:MM) for `date`. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const SECONDS_PER_YEAR = 365 * 24 * 3600
const INSTALMENTS = 3 // DEMO_LOAN.paymentTotal on the backend

/** What the ledger will charge for a bond: the annual rate prorated to each instalment's real
 *  duration (that is how XLS-66 applies InterestRate), so the issuer sees the per-minute rate and
 *  the drops of interest before posting. Mirrors termsFromAsk() on the backend. */
export function previewLoanTerms(amountXrp: number, annualPct: number, callDate: Date, now = new Date()) {
  const secondsToCall = Math.max(60 * INSTALMENTS, Math.floor((callDate.getTime() - now.getTime()) / 1000))
  const intervalSec = Math.max(60, Math.floor(secondsToCall / INSTALMENTS))
  const perMinutePct = annualPct / (SECONDS_PER_YEAR / 60)
  const perIntervalRate = (annualPct / 100) * (intervalSec / SECONDS_PER_YEAR)
  // Simple-interest approximation of the ledger's annuity: exact to the drop at these durations.
  const interestPerInstalmentXrp = amountXrp * perIntervalRate
  const totalInterestXrp = interestPerInstalmentXrp * INSTALMENTS
  const principalPerInstalmentXrp = amountXrp / INSTALMENTS
  return { secondsToCall, intervalSec, perMinutePct, interestPerInstalmentXrp, totalInterestXrp, principalPerInstalmentXrp, instalments: INSTALMENTS }
}
