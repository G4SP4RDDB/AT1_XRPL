// Off-chain address -> bank-profile registry. Talks to the chain shim's /profile/* routes
// (backed by src/chain/profileStore.ts) so a bank name persists across browsers/reloads,
// not just in this tab's localStorage.
import { useEffect, useState } from 'react'
import type { BankProfile } from '@shared/types'

const CHAIN_URL = import.meta.env.VITE_CHAIN_URL || 'http://localhost:8787'

// undefined = never fetched, null = fetched and no profile exists
const cache = new Map<string, BankProfile | null>()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

async function callProfileRoute<T>(fn: string, args: unknown[]): Promise<T> {
  const res = await fetch(`${CHAIN_URL}/profile/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `profile.${fn} failed: ${res.status}`)
  }
  return res.json()
}

export function getCachedProfile(address: string): BankProfile | null | undefined {
  return cache.get(address)
}

export async function loadProfile(address: string): Promise<BankProfile | null> {
  if (!address) return null
  try {
    const profile = await callProfileRoute<BankProfile | null>('get', [address])
    cache.set(address, profile)
    notify()
    return profile
  } catch (e) {
    console.warn('Failed to load bank profile for', address, e)
    return cache.get(address) ?? null
  }
}

export interface SaveBankProfileInput {
  address: string
  bankName: string
  shortCode?: string
  country?: string
  logoEmoji?: string
  rating?: string
}

export async function saveProfile(input: SaveBankProfileInput): Promise<BankProfile> {
  const profile = await callProfileRoute<BankProfile>('set', [input])
  cache.set(input.address, profile)
  notify()
  return profile
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function shortenAddress(address: string, head = 6, tail = 4): string {
  if (!address) return ''
  return `${address.slice(0, head)}...${address.slice(-tail)}`
}

/** Resolves an address to its bank name, fetching + caching on first use. Falls back to
 * `fallback` (or the shortened address) until a profile is known. */
export function useBankName(address?: string | null, fallback?: string): string {
  const [, forceRender] = useState(0)

  useEffect(() => {
    if (!address) return
    if (!cache.has(address)) {
      loadProfile(address)
    }
    return subscribe(() => forceRender((n) => n + 1))
  }, [address])

  if (!address) return fallback ?? ''
  const profile = cache.get(address)
  if (profile?.bankName) return profile.bankName
  return fallback ?? shortenAddress(address)
}

/** Resolves an address to its full profile (or null/undefined while unknown), for onboarding checks. */
export function useBankProfile(address?: string | null): BankProfile | null | undefined {
  const [, forceRender] = useState(0)

  useEffect(() => {
    if (!address) return
    if (!cache.has(address)) {
      loadProfile(address)
    }
    return subscribe(() => forceRender((n) => n + 1))
  }, [address])

  if (!address) return undefined
  return cache.get(address)
}

/** Bumps whenever any profile in the cache changes — for a parent that needs to recompute
 * something derived across many addresses (e.g. filter options) without resolving any one
 * address itself. Best-effort: only reflects profiles some component has already fetched. */
export function useProfilesVersion(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => subscribe(() => setVersion((n) => n + 1)), [])
  return version
}
