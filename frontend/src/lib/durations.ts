// Shared "time-in-force" helpers for both sides of the order book: a tranche's bidding
// window (Bid.expiresAt) and an LP's bid validity (Ask.expiresAt). Off-chain only — purely
// a book-hygiene concept, not enforced by the ledger.
export const DURATION_OPTIONS = [
  { label: '6 hours', ms: 6 * 60 * 60 * 1000 },
  { label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { label: '3 days', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '14 days', ms: 14 * 24 * 60 * 60 * 1000 },
] as const

export function expiresAtFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

export function isExpired(expiresAt?: string): boolean {
  return Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now())
}

export function formatTimeRemaining(expiresAt?: string): string {
  if (!expiresAt) return 'No expiry'
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const hours = Math.floor(ms / (60 * 60 * 1000))
  if (hours < 1) return '<1h left'
  if (hours < 24) return `${hours}h left`
  const days = Math.floor(hours / 24)
  return `${days}d left`
}
