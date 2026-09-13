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
