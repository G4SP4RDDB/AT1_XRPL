import { useEffect, useState } from 'react'
import type { FC } from 'react'
import type { Bid, Ask } from '@shared/types'
import { chainClient } from '@/lib/chainClient'
import { ResolvedName } from './ResolvedName'
import { TranchePage } from './TranchePage'
import { bookTheme } from '@/lib/orderBookTheme'
import { formatTimeRemaining, isExpired } from '@/lib/durations'
import { getTrancheIdFromHash, navigateToTranche } from '@/lib/hashRoute'

type SortKey = 'rate' | 'callDate' | 'expires'

function fillFraction(bid: Bid, asksForBid: Ask[]): number {
  const target = Number(bid.amount) || 0
  if (target <= 0) return 0
  const filled = asksForBid
    .filter((a) => a.status === 'deposited')
    .reduce((sum, a) => sum + Number(a.amount || 0), 0)
  return Math.min(1, filled / target)
}

export const TrancheBook: FC = () => {
  const [bids, setBids] = useState<Bid[]>([])
  const [asksByTranche, setAsksByTranche] = useState<Record<string, Ask[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('rate')
  const [selectedId, setSelectedId] = useState<string | null>(() => getTrancheIdFromHash())

  useEffect(() => {
    const onHashChange = () => setSelectedId(getTrancheIdFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const refresh = async () => {
    try {
      const [openBids, allAsks] = await Promise.all([chainClient.getBids(), chainClient.getAsks()])
      const tranches = openBids.filter((b) => b.status === 'open' || b.status === 'matched')
      setBids(tranches)
      const grouped: Record<string, Ask[]> = {}
      for (const ask of allAsks) {
        if (!ask.matchedBidId) continue
        ;(grouped[ask.matchedBidId] ??= []).push(ask)
      }
      setAsksByTranche(grouped)
    } catch (err) {
      console.error('Failed to load order book:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  if (selectedId) {
    return <TranchePage trancheId={selectedId} />
  }

  const sorted = [...bids].sort((a, b) => {
    if (sortKey === 'rate') return b.yieldRate - a.yieldRate
    if (sortKey === 'callDate') return new Date(a.callDate).getTime() - new Date(b.callDate).getTime()
    const aExp = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity
    const bExp = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity
    return aExp - bExp
  })

  return (
    <div
      style={{
        background: bookTheme.pageBg,
        border: `1px solid ${bookTheme.border}`,
        borderRadius: '20px',
        padding: '2rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontFamily: bookTheme.serif, fontSize: '1.9rem', fontWeight: 400, margin: 0, color: 'var(--text-primary)' }}>
            AT1 Tranche Order Book
          </h2>
          <p style={{ color: bookTheme.textSecondary, marginTop: '0.4rem', fontSize: '0.9rem' }}>
            Every open tranche the platform's borrowers have emitted, ranked by rate, call date or bidding-window expiry.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {(['rate', 'callDate', 'expires'] as SortKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`btn btn-sm ${sortKey === key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSortKey(key)}
            >
              Sort: {key === 'rate' ? 'Rate' : key === 'callDate' ? 'Call Date' : 'Expires'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: bookTheme.textMuted }}>Loading tranches...</div>
      ) : sorted.length === 0 ? (
        <div
          style={{
            background: bookTheme.panelBg,
            border: `1px solid ${bookTheme.border}`,
            borderRadius: '12px',
            textAlign: 'center',
            padding: '3rem 2rem',
            color: bookTheme.textMuted,
          }}
        >
          No open tranches. Emit one from the <strong>Issue Bond</strong> tab.
        </div>
      ) : (
        <div style={{ background: bookTheme.panelBg, border: `1px solid ${bookTheme.border}`, borderRadius: '12px', overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.6fr 1fr 0.8fr 1fr 1fr 1.4fr',
              gap: '0.5rem',
              padding: '0.75rem 1.25rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: bookTheme.textMuted,
              borderBottom: `1px solid ${bookTheme.border}`,
            }}
          >
            <span>Bank</span>
            <span>Amount</span>
            <span>Rate</span>
            <span>Call Date</span>
            <span>Expires</span>
            <span>Filled</span>
          </div>

          {sorted.map((bid) => {
            const asksForBid = asksByTranche[bid.id] ?? []
            const fraction = fillFraction(bid, asksForBid)
            const expired = isExpired(bid.expiresAt)
            return (
              <div
                key={bid.id}
                onClick={() => navigateToTranche(bid.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.6fr 1fr 0.8fr 1fr 1fr 1.4fr',
                  gap: '0.5rem',
                  alignItems: 'center',
                  padding: '0.9rem 1.25rem',
                  cursor: 'pointer',
                  borderBottom: `1px solid ${bookTheme.border}`,
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }} title={bid.borrowerAddress}>
                  <ResolvedName address={bid.borrowerAddress} fallback={bid.borrowerName || 'AT1 Bond'} />
                </span>
                <span>{Number(bid.amount).toLocaleString()} XRP</span>
                <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>{bid.yieldRate}%</span>
                <span style={{ fontSize: '0.82rem', color: bookTheme.textSecondary }}>
                  {new Date(bid.callDate).toLocaleDateString()}
                </span>
                <span style={{ fontSize: '0.8rem', color: expired ? 'var(--accent-red)' : bookTheme.textSecondary }}>
                  {formatTimeRemaining(bid.expiresAt)}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div
                    style={{
                      flex: 1,
                      height: '6px',
                      borderRadius: '9999px',
                      background: bookTheme.pageBg,
                      border: `1px solid ${bookTheme.border}`,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.round(fraction * 100)}%`,
                        height: '100%',
                        background: fraction >= 1 ? 'var(--accent-green)' : 'var(--accent-blue)',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: bookTheme.textMuted, minWidth: '2.5rem', textAlign: 'right' }}>
                    {Math.round(fraction * 100)}%
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
