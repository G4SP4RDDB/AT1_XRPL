// Formatting helpers for the Finance Bonds table, ported from app.morpho.org/vaults' row
// spec and adapted to AT1 bond tranches. No live price oracle in this project (native-XRP
// only, per the project's own decision) — XRP_USD_RATE is a static, clearly-labeled
// placeholder, not a real feed.
export const XRP_USD_RATE = 1.08

export function toUsd(xrpAmount: number): number {
  return xrpAmount * XRP_USD_RATE
}

/** Middle-truncate long names: keep the first 14 and last 13 characters. */
export function mid(name: string): string {
  return name.length > 30 ? `${name.slice(0, 14)}...${name.slice(-13)}` : name
}

/** 2 decimals always; "M" suffix >= 1e6; "k" suffix >= 1e4 only (so 8992.74 prints in
 * full, 18.37k is abbreviated). */
export function fmt(x: number): string {
  if (x >= 1e6) return `${(x / 1e6).toFixed(2)}M`
  if (x >= 1e4) return `${(x / 1e3).toFixed(2)}k`
  return x.toFixed(2)
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** "6d 14h", or "14h 22m" once under 24h, or "Closed" once past expiry. */
export function countdownLabel(expiresAt?: string): string {
  if (!expiresAt) return 'No expiry'
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Closed'
  const totalMinutes = Math.floor(ms / (60 * 1000))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  if (days >= 1) return `${days}d ${hours}h`
  return `${hours}h ${minutes}m`
}

export function isUrgent(expiresAt?: string): boolean {
  if (!expiresAt) return false
  const ms = new Date(expiresAt).getTime() - Date.now()
  return ms > 0 && ms < 24 * 60 * 60 * 1000
}

export function isClosed(expiresAt?: string): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= Date.now()
}

export function absoluteLabel(expiresAt?: string): string {
  if (!expiresAt) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(expiresAt))
  } catch {
    return new Date(expiresAt).toLocaleString()
  }
}

const COUNTRY_CODES: Record<string, string> = {
  Sweden: 'SE',
  Netherlands: 'NL',
  Luxembourg: 'LU',
  Ireland: 'IE',
  France: 'FR',
  Switzerland: 'CH',
  Germany: 'DE',
  Spain: 'ES',
  Italy: 'IT',
  'United Kingdom': 'GB',
  'United States': 'US',
}

/** Full country name -> 2-letter code for the known seed set; best-effort fallback
 * (first two letters) for anything a user types into their own profile. */
export function jurisdictionCode(country?: string): string | undefined {
  if (!country) return undefined
  return COUNTRY_CODES[country] ?? country.slice(0, 2).toUpperCase()
}
