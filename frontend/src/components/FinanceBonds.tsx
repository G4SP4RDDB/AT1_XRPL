import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FC, MouseEvent } from 'react'
import type { Ask, Bid } from '@shared/types'
import { chainClient } from '@/lib/chainClient'
import { getCachedProfile, useBankProfile, useProfilesVersion } from '@/lib/bankProfiles'
import { absoluteLabel, countdownLabel, fmt, isClosed, isUrgent, jurisdictionCode, mid, slugify, toUsd } from '@/lib/bankBondFormat'

/**
 * Row layout ported from app.morpho.org/vaults (inspected 13 Sep 2026), remapped to AT1
 * bond tranches: one row per bank, showing its best-yield offer, grouped rather than the
 * flat per-tranche list the Order Book tab shows. Every cell is its own <a> to the same
 * href (middle-click / new-tab / keyboard all work for free) rather than a row onClick.
 *
 * Deviations from the literal spec, both because this app has no real router:
 * - href points at this app's own #/orderbook/<id> hash route (reusing the Order Book
 *   tab's per-tranche page) instead of a /issuer/{slug}/offer/{id} path that nothing here
 *   would resolve — a fake path would just be a broken link.
 * - Colors/fonts follow this app's existing CSS variables, not Morpho's (the fetched page
 *   carried no CSS to copy).
 * - Currency is always XRP and the fiat line uses a static placeholder rate (no live
 *   oracle in this project); "Liquidity" is the tranche's *remaining* capacity (target
 *   minus what's already deposited), not the full original size, since that's the number
 *   that actually matters for "can I still fund this."
 */
interface FinanceBondsProps {
  onNavigateToOrderBook: () => void
}

type SortKey = 'yield' | 'liquidity' | 'closes'

interface BankRowData {
  borrowerAddress: string
  fallbackName: string
  topOffer: Ask
  bestYieldPct: number
  offerCount: number
  remainingLiquidity: number
  closesAt?: string
}

function remainingLiquidity(ask: Ask, bids: Bid[]): number {
  const target = Number(ask.amount) || 0
  const filled = bids
    .filter((b) => b.matchedAskId === ask.id && b.status === 'deposited')
    .reduce((sum, b) => sum + Number(b.amount || 0), 0)
  return Math.max(0, target - filled)
}

function buildBankRows(asks: Ask[], bids: Bid[]): BankRowData[] {
  const byBank = new Map<string, Ask[]>()
  for (const ask of asks) {
    const list = byBank.get(ask.borrowerAddress) ?? []
    list.push(ask)
    byBank.set(ask.borrowerAddress, list)
  }

  const rows: BankRowData[] = []
  for (const [borrowerAddress, group] of byBank) {
    const topOffer = [...group].sort((a, b) => b.yieldRate - a.yieldRate)[0]
    rows.push({
      borrowerAddress,
      fallbackName: topOffer.borrowerName || 'AT1 Bond',
      topOffer,
      bestYieldPct: topOffer.yieldRate,
      offerCount: group.length,
      remainingLiquidity: remainingLiquidity(topOffer, bids),
      closesAt: topOffer.expiresAt,
    })
  }
  return rows
}

const thStyle: CSSProperties = {
  padding: '0.7rem 1rem',
  fontSize: '0.7rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-muted)',
}

const tdStyle: CSSProperties = { padding: 0 }

const linkStyle: CSSProperties = {
  display: 'block',
  padding: '0.85rem 1rem',
  color: 'inherit',
  textDecoration: 'none',
}

function SkeletonTable() {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {Array.from({ length: 6 }).map((_, rowIdx) => (
            <tr key={rowIdx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {Array.from({ length: 6 }).map((_, colIdx) => (
                <td key={colIdx} style={{ padding: '0.9rem 1rem' }}>
                  <div
                    style={{
                      height: '12px',
                      borderRadius: '4px',
                      background: 'var(--bg-surface-elevated)',
                      width: colIdx === 0 ? '24px' : colIdx === 5 ? '16px' : '70%',
                      marginLeft: colIdx >= 2 ? 'auto' : undefined,
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface BankBondRowProps {
  row: BankRowData
  jurisdictionFilter: string
  ratingFilter: string
  onNavigate: (e: MouseEvent<HTMLAnchorElement>) => void
}

const BankBondRow: FC<BankBondRowProps> = ({ row, jurisdictionFilter, ratingFilter, onNavigate }) => {
  const profile = useBankProfile(row.borrowerAddress)
  const name = profile?.bankName ?? row.fallbackName
  const code = jurisdictionCode(profile?.country)
  const rating = profile?.rating

  if (jurisdictionFilter && code !== jurisdictionFilter) return null
  if (ratingFilter && rating !== ratingFilter) return null

  const href = `#/orderbook/${encodeURIComponent(row.topOffer.id)}`
  const closed = isClosed(row.closesAt)
  const urgent = isUrgent(row.closesAt)

  return (
    <tr
      data-slug={slugify(name)}
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        opacity: closed ? 0.45 : 1,
      }}
    >
      <td style={tdStyle}>
        <a href={href} onClick={closed ? (e) => e.preventDefault() : onNavigate} style={linkStyle}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              borderRadius: '9999px',
              background: 'var(--bg-surface-elevated)',
              fontSize: '0.9rem',
            }}
          >
            {profile?.logoEmoji ?? '🏦'}
          </span>
        </a>
      </td>
      <td style={tdStyle}>
        <a href={href} onClick={closed ? (e) => e.preventDefault() : onNavigate} style={linkStyle}>
          <span title={name} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
            {mid(name)}
          </span>
          {(code || rating) && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {[code, rating].filter(Boolean).join(' · ')}
            </div>
          )}
        </a>
      </td>
      <td style={tdStyle}>
        <a href={href} onClick={closed ? (e) => e.preventDefault() : onNavigate} style={{ ...linkStyle, textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: 'var(--accent-green)' }}>{row.bestYieldPct.toFixed(2)}%</div>
          <small style={{ color: 'var(--text-muted)' }}>best of {row.offerCount}</small>
        </a>
      </td>
      <td style={tdStyle}>
        <a href={href} onClick={closed ? (e) => e.preventDefault() : onNavigate} style={{ ...linkStyle, textAlign: 'right' }}>
          <div>{fmt(row.remainingLiquidity)} XRP</div>
          <small style={{ color: 'var(--text-muted)' }}>${fmt(toUsd(row.remainingLiquidity))}</small>
        </a>
      </td>
      <td style={tdStyle}>
        <a href={href} onClick={closed ? (e) => e.preventDefault() : onNavigate} style={{ ...linkStyle, textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: closed ? 'var(--text-muted)' : urgent ? 'var(--accent-red)' : 'var(--text-primary)' }}>
            {closed ? 'Closed' : countdownLabel(row.closesAt)}
          </div>
          {!closed && <small style={{ color: 'var(--text-muted)' }}>{absoluteLabel(row.closesAt)}</small>}
        </a>
      </td>
      <td style={tdStyle}>
        <a
          href={href}
          onClick={closed ? (e) => e.preventDefault() : onNavigate}
          aria-label={`View ${name}`}
          style={{ ...linkStyle, textAlign: 'right', color: 'var(--text-muted)' }}
        >
          ›
        </a>
      </td>
    </tr>
  )
}

export const FinanceBonds: FC<FinanceBondsProps> = ({ onNavigateToOrderBook }) => {
  const [bankRows, setBankRows] = useState<BankRowData[] | null>(null)
  const [jurisdictionFilter, setJurisdictionFilter] = useState('')
  const [ratingFilter, setRatingFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('yield')
  const profilesVersion = useProfilesVersion()

  const load = async () => {
    const [allAsks, allBids] = await Promise.all([chainClient.getAsks(), chainClient.getBids()])
    setBankRows(buildBankRows(allAsks.filter((a) => a.status === 'open'), allBids))
  }

  useEffect(() => {
    load()
  }, [])

  const sortedRows = useMemo(() => {
    const rows = bankRows ?? []
    const copy = [...rows]
    if (sortKey === 'yield') copy.sort((a, b) => b.bestYieldPct - a.bestYieldPct)
    else if (sortKey === 'liquidity') copy.sort((a, b) => b.remainingLiquidity - a.remainingLiquidity)
    else {
      copy.sort((a, b) => {
        const aT = a.closesAt ? new Date(a.closesAt).getTime() : Infinity
        const bT = b.closesAt ? new Date(b.closesAt).getTime() : Infinity
        return aT - bT
      })
    }
    return copy
  }, [bankRows, sortKey])

  // Best-effort filter option lists from whatever bank profiles are already cached;
  // profilesVersion forces a recompute as more of them load in.
  const { jurisdictions, ratings } = useMemo(() => {
    const jSet = new Set<string>()
    const rSet = new Set<string>()
    for (const row of bankRows ?? []) {
      const profile = getCachedProfile(row.borrowerAddress)
      const code = jurisdictionCode(profile?.country)
      if (code) jSet.add(code)
      if (profile?.rating) rSet.add(profile.rating)
    }
    return { jurisdictions: Array.from(jSet).sort(), ratings: Array.from(rSet).sort() }
    // profilesVersion is a trigger only, not itself read
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankRows, profilesVersion])

  const handleNavigate = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    onNavigateToOrderBook()
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h3 className="section-title">Finance Bonds</h3>
          <p className="section-subtitle">Every bank currently raising AT1 capital, ranked by best yield on offer.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-select" value={jurisdictionFilter} onChange={(e) => setJurisdictionFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All Jurisdictions</option>
          {jurisdictions.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
        <select className="form-select" value="XRP" disabled style={{ width: 'auto' }}>
          <option value="XRP">XRP</option>
        </select>
        <select className="form-select" value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All Ratings</option>
          {ratings.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className="form-select"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          style={{ width: 'auto', marginLeft: 'auto' }}
        >
          <option value="yield">Sort by: Best Yield</option>
          <option value="liquidity">Sort by: Liquidity</option>
          <option value="closes">Sort by: Closes In</option>
        </select>
      </div>

      {bankRows === null ? (
        <SkeletonTable />
      ) : sortedRows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</div>
          <h4 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
            No Active Bonds Awaiting Funding
          </h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto', lineHeight: '1.5' }}>
            All existing vaults on the XRPL ledger are either fully funded or active. Switch to the <strong>Issue AT1 Bond</strong> tab to emit a new bond and provision a live vault on-chain.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={thStyle} />
                <th style={{ ...thStyle, textAlign: 'left' }}>Bank</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Best Yield</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Liquidity</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Closes In</th>
                <th style={{ ...thStyle, width: '2.5rem' }} />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <BankBondRow
                  key={row.borrowerAddress}
                  row={row}
                  jurisdictionFilter={jurisdictionFilter}
                  ratingFilter={ratingFilter}
                  onNavigate={handleNavigate}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
