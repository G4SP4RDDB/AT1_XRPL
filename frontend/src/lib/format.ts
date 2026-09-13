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
const INTERVAL_SEC = 60 // DEMO_LOAN.paymentIntervalSec on the backend
const INSTALMENTS = 10_000 // DEMO_LOAN.paymentTotal: a long schedule so each instalment is interest + 1/10,000 of principal

/** What the ledger will charge: the annual rate prorated to each 60 s instalment (that is how XLS-66
 *  applies InterestRate). Principal is not on the schedule's clock: it is repaid on the issuer's
 *  initiative from the call date on. Mirrors termsFromAsk() on the backend. */
export function previewLoanTerms(amountXrp: number, annualPct: number, callDate: Date, now = new Date()) {
  const secondsToCall = Math.max(INTERVAL_SEC, Math.floor((callDate.getTime() - now.getTime()) / 1000))
  const instalmentsToCall = Math.max(1, Math.floor(secondsToCall / INTERVAL_SEC))
  const perMinutePct = annualPct / (SECONDS_PER_YEAR / 60)
  const perIntervalRate = (annualPct / 100) * (INTERVAL_SEC / SECONDS_PER_YEAR)
  const interestPerInstalmentXrp = amountXrp * perIntervalRate
  const principalPerInstalmentXrp = amountXrp / INSTALMENTS
  const interestToCallXrp = interestPerInstalmentXrp * instalmentsToCall
  return { secondsToCall, intervalSec: INTERVAL_SEC, instalmentsToCall, perMinutePct, interestPerInstalmentXrp, principalPerInstalmentXrp, interestToCallXrp }
}
