import { useEffect, useState } from 'react'
import type { FC } from 'react'
import type { Bid, Ask } from '@shared/types'
import { chainClient } from '@/lib/chainClient'
import { ResolvedName } from './ResolvedName'
import { TrancheDetail } from './TrancheDetail'

type SortKey = 'rate' | 'maturity' | 'urgency'

const URGENCY_RANK: Record<string, number> = { urgent: 0, standard: 1, flexible: 2 }
const URGENCY_LABEL: Record<string, string> = { urgent: 'Urgent', standard: 'Standard', flexible: 'Flexible' }
const URGENCY_COLOR: Record<string, string> = {
  urgent: 'var(--accent-red)',
  standard: 'var(--accent-blue)',
  flexible: 'var(--accent-green)',
}

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
  const [sortKey, setSortKey] = useState<SortKey>('urgency')
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  const sorted = [...bids].sort((a, b) => {
    if (sortKey === 'rate') return b.yieldRate - a.yieldRate
    if (sortKey === 'maturity') return new Date(a.callDate).getTime() - new Date(b.callDate).getTime()
    return (URGENCY_RANK[a.urgency ?? 'standard'] ?? 1) - (URGENCY_RANK[b.urgency ?? 'standard'] ?? 1)
  })

  const selectedBid = selectedId ? bids.find((b) => b.id === selectedId) ?? null : null

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">AT1 Tranche Order Book</h2>
          <p className="section-subtitle">
            Every open tranche the platform's borrowers have emitted, ranked by rate, maturity or funding urgency.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {(['urgency', 'rate', 'maturity'] as SortKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`btn btn-sm ${sortKey === key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSortKey(key)}
            >
              Sort: {key === 'urgency' ? 'Urgency' : key === 'rate' ? 'Rate' : 'Maturity'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading tranches...</div>
      ) : sorted.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-muted)' }}>
          No open tranches. Emit one from the <strong>Issue Bond</strong> tab.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.6fr 1fr 0.8fr 1fr 0.9fr 1.4fr',
              gap: '0.5rem',
              padding: '0.75rem 1.25rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <span>Bank</span>
            <span>Amount</span>
            <span>Rate</span>
            <span>Maturity</span>
            <span>Urgency</span>
            <span>Filled</span>
          </div>

          {sorted.map((bid) => {
            const asksForBid = asksByTranche[bid.id] ?? []
            const fraction = fillFraction(bid, asksForBid)
            const isSelected = selectedId === bid.id
            return (
              <div
                key={bid.id}
                onClick={() => setSelectedId(isSelected ? null : bid.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.6fr 1fr 0.8fr 1fr 0.9fr 1.4fr',
                  gap: '0.5rem',
                  alignItems: 'center',
                  padding: '0.9rem 1.25rem',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--bg-surface-elevated)' : 'transparent',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }} title={bid.borrowerAddress}>
                  <ResolvedName address={bid.borrowerAddress} fallback={bid.borrowerName || 'AT1 Bond'} />
                </span>
                <span>{Number(bid.amount).toLocaleString()} XRP</span>
                <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>{bid.yieldRate}%</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {new Date(bid.callDate).toLocaleDateString()}
                </span>
                <span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '9999px',
                      color: '#fff',
                      background: URGENCY_COLOR[bid.urgency ?? 'standard'],
                    }}
                  >
                    {URGENCY_LABEL[bid.urgency ?? 'standard']}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div
                    style={{
                      flex: 1,
                      height: '6px',
                      borderRadius: '9999px',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
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
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '2.5rem', textAlign: 'right' }}>
                    {Math.round(fraction * 100)}%
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {selectedBid && (
        <div style={{ marginTop: '1.5rem' }}>
          <TrancheDetail
            bid={selectedBid}
            asks={asksByTranche[selectedBid.id] ?? []}
            onRefresh={refresh}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  )
}
