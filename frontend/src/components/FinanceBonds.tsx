import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FC } from 'react'
import type { Ask } from '@shared/types'
import { chainClient, type VaultState } from '@/lib/chainClient'
import { useWallet } from '@/lib/wallet'
import { canLend } from '@/lib/roles'
import { getCachedProfile, useBankProfile, useProfilesVersion } from '@/lib/bankProfiles'
import { absoluteLabel, countdownLabel, fmt, isClosed, isUrgent, jurisdictionCode, mid, slugify, toUsd } from '@/lib/bankBondFormat'
import { FundBondModal } from './FundBondModal'

/**
 * Row layout ported from app.morpho.org/vaults (inspected 13 Sep 2026), remapped to AT1
 * bond tranches: one row per bank, showing its best-yield offer, grouped by borrower.
 * Funding is direct — clicking a row opens FundBondModal for a real VaultDeposit — there is no
 * separate order-book/bid-matching layer (removed after proving unreliable in practice; see
 * docs/bank-profiles-and-order-book.md).
 *
 * Deviations from the literal spec, both because this app has no real router:
 * - Colors/fonts follow this app's existing CSS variables, not Morpho's (the fetched page
 *   carried no CSS to copy).
 * - Currency is always XRP and the fiat line uses a static placeholder rate (no live
 *   oracle in this project); "Liquidity" is the tranche's *remaining* capacity (target minus
 *   what's already been deposited on-chain), not the full original size, since that's the
 *   number that actually matters for "can I still fund this."
 */
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

function remainingLiquidity(ask: Ask, vault?: VaultState): number {
  const target = Number(ask.amount) || 0
  const deposited = Number(vault?.assetsTotal ?? 0)
  return Math.max(0, target - deposited)
}

function buildBankRows(asks: Ask[], vaultsById: Map<string, VaultState>): BankRowData[] {
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
      remainingLiquidity: remainingLiquidity(topOffer, topOffer.vaultId ? vaultsById.get(topOffer.vaultId) : undefined),
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

const tdStyle: CSSProperties = { padding: '0.85rem 1rem' }

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
  canFund: boolean
  onSelect: (row: BankRowData) => void
}

const BankBondRow: FC<BankBondRowProps> = ({ row, jurisdictionFilter, ratingFilter, canFund, onSelect }) => {
  const profile = useBankProfile(row.borrowerAddress)
  const name = profile?.bankName ?? row.fallbackName
  const code = jurisdictionCode(profile?.country)
  const rating = profile?.rating

  if (jurisdictionFilter && code !== jurisdictionFilter) return null
  if (ratingFilter && rating !== ratingFilter) return null

  const closed = isClosed(row.closesAt) || row.remainingLiquidity <= 0
  const urgent = isUrgent(row.closesAt)
  const clickable = canFund && !closed

  return (
    <tr
      data-slug={slugify(name)}
      onClick={clickable ? () => onSelect(row) : undefined}
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        opacity: closed ? 0.45 : 1,
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <td style={tdStyle}>
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
      </td>
      <td style={tdStyle}>
        <span title={name} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
          {mid(name)}
        </span>
        {(code || rating) && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {[code, rating].filter(Boolean).join(' · ')}
          </div>
        )}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        <div style={{ fontWeight: 700, color: 'var(--accent-green)' }}>{row.bestYieldPct.toFixed(2)}%</div>
        <small style={{ color: 'var(--text-muted)' }}>best of {row.offerCount}</small>
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        <div>{fmt(row.remainingLiquidity)} XRP</div>
        <small style={{ color: 'var(--text-muted)' }}>${fmt(toUsd(row.remainingLiquidity))}</small>
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        <div style={{ fontWeight: 700, color: closed ? 'var(--text-muted)' : urgent ? 'var(--accent-red)' : 'var(--text-primary)' }}>
          {closed ? 'Closed' : countdownLabel(row.closesAt)}
        </div>
        {!closed && <small style={{ color: 'var(--text-muted)' }}>{absoluteLabel(row.closesAt)}</small>}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right', width: '2.5rem', color: 'var(--text-muted)' }}>
        {clickable ? '›' : ''}
      </td>
    </tr>
  )
}

export const FinanceBonds: FC = () => {
  const { currentAccount } = useWallet()
  const [bankRows, setBankRows] = useState<BankRowData[] | null>(null)
  const [jurisdictionFilter, setJurisdictionFilter] = useState('')
  const [ratingFilter, setRatingFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('yield')
  const [selectedRow, setSelectedRow] = useState<BankRowData | null>(null)
  const profilesVersion = useProfilesVersion()

  const load = async () => {
    const [allAsks, vaults] = await Promise.all([chainClient.getAsks(), chainClient.getAllVaults()])
    const vaultsById = new Map(vaults.map((v) => [v.vaultId, v]))
    setBankRows(buildBankRows(allAsks.filter((a) => a.status === 'open'), vaultsById))
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

  const selectedProfile = selectedRow ? getCachedProfile(selectedRow.borrowerAddress) : undefined
  const canFund = canLend(currentAccount?.role)

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

      {!canFund && currentAccount && (
        <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '0.82rem' }}>
          Only investor (lender) accounts can fund a bond. This account is registered as
          {currentAccount.role === 'borrower' ? ' an issuer' : currentAccount.role === 'broker' ? ' the platform broker' : ' not onboarded yet'}.
        </div>
      )}

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
                  canFund={canFund}
                  onSelect={setSelectedRow}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedRow && (
        <FundBondModal
          ask={selectedRow.topOffer}
          bankName={selectedProfile?.bankName ?? selectedRow.fallbackName}
          remainingLiquidity={selectedRow.remainingLiquidity}
          onClose={() => setSelectedRow(null)}
          onSuccess={() => {
            setSelectedRow(null)
            load()
          }}
        />
      )}
    </div>
  )
}
