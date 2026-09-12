// Tiny hash-based router for the order book, so each tranche gets its own real,
// shareable/bookmarkable URL (#/orderbook/<id>) without pulling in a routing library.
const PREFIX = '#/orderbook'

export function getTrancheIdFromHash(): string | null {
  const hash = window.location.hash
  if (!hash.startsWith(PREFIX)) return null
  const rest = hash.slice(PREFIX.length)
  if (!rest.startsWith('/')) return null
  const id = decodeURIComponent(rest.slice(1))
  return id || null
}

export function navigateToTranche(id: string): void {
  window.location.hash = `${PREFIX}/${encodeURIComponent(id)}`
}

export function navigateToTrancheList(): void {
  window.location.hash = PREFIX
}
