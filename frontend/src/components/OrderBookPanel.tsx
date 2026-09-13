import { useState } from 'react'
import type { CSSProperties, FC } from 'react'
import type { Ask, Bid } from '@shared/types'
import { useBankName } from '@/lib/bankProfiles'
import { bookTheme } from '@/lib/orderBookTheme'
import { isExpired } from '@/lib/durations'

/**
 * Mirrored bid/ask book modeled on app.hyperliquid.xyz/trade's order book panel: asks
 * above the spread (worst at the outer edge, best adjacent to the middle), bids below
 * (best adjacent to the middle, worst at the outer edge), a fixed row count per side
 * padded with blanks so the panel never reflows, cumulative "Total" growing from the
 * spread outward, and a depth bar per row anchored to the right edge.
 *
 * Adapted to this app's actual mechanics, not copied wholesale:
 * - There is only ever one resting **ask** (the tranche's own posted rate/size). Bids
 *   can each propose their own rate until the borrower accepts one — accepting locks the
 *   tranche's rate to that bid's rate (XLS-66 gives every depositor in a vault the same
 *   rate, so only one can win); any other pending bid at a different rate is then
 *   auto-declined. So the ask side has at most one real row; the Spread row is honestly
 *   0 while no rate is locked yet.
 * - Bid rows are ranked deposited first, then accepted, then pending, then declined —
 *   the most "real" commitments first — rather than by price.
 * - No aggregation-tick or size-unit controls: there is only one price level to bucket
 *   and only one unit (XRP) in this project.
 * - No websocket/animation-frame throttling: this panel refreshes on explicit user
 *   actions (place/respond/fund/originate), not a live-streaming feed.
 * - Rows are keyed by their actual id (bid/ask id), not price — many bid rows can and do
 *   share the same price here, price alone would not be a stable/unique key.
 * - The lender's name (useful in an institutional lending context, unlike an anonymous
 *   public exchange book) is kept as a hover tooltip rather than a 4th column, to stay
 *   within the spec's 3-column layout.
 */
const ROWS_PER_SIDE = 6
const ASK_BAR_COLOR = 'rgba(220, 38, 38, 0.08)'
const BID_BAR_COLOR = 'rgba(5, 150, 105, 0.08)'

const numericStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontFamily: "ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace",
}

interface AskRowData {
  id: string
  price: number
  size: number
  total: number
  borrowerAddress: string
  fallbackName: string
  expiresAt?: string
}

interface BidRowData {
  id: string
  price: number
  size: number
  total: number
  lenderAddress?: string
  fallbackName?: string
  status?: Bid['status']
  expiresAt?: string
  overflowCount?: number
}

function rowStyle(highlighted: boolean): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '1.4fr 1fr 1fr',
    gap: '0.5rem',
    alignItems: 'center',
    height: '1.6rem',
    padding: '0 0.75rem',
    fontSize: '0.8rem',
    position: 'relative',
    cursor: 'pointer',
    background: highlighted ? 'rgba(0, 0, 0, 0.035)' : undefined,
  }
}

function barStyle(widthPct: number, color: string): CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: `${Math.max(0, Math.min(100, widthPct))}%`,
    background: color,
    zIndex: 0,
  }
}

const AskLevelRow: FC<{
  row: AskRowData
  widthPct: number
  highlighted: boolean
  onHover: () => void
  onLeave: () => void
  onSelect: () => void
}> = ({ row, widthPct, highlighted, onHover, onLeave, onSelect }) => {
  const name = useBankName(row.borrowerAddress, row.fallbackName)
  const expired = isExpired(row.expiresAt)
  return (
    <div
      style={rowStyle(highlighted)}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onSelect}
      title={`${name}${expired ? ' · bidding window closed' : ''}`}
    >
      <div style={barStyle(widthPct, ASK_BAR_COLOR)} />
      <span style={{ ...numericStyle, position: 'relative', color: 'var(--accent-red)', fontWeight: 700 }}>{row.price.toFixed(2)}%</span>
      <span style={{ ...numericStyle, position: 'relative', textAlign: 'right' }}>{row.size.toLocaleString()}</span>
      <span style={{ ...numericStyle, position: 'relative', textAlign: 'right', color: bookTheme.textMuted }}>{row.total.toLocaleString()}</span>
    </div>
  )
}

const BidLevelRow: FC<{
  row: BidRowData
  widthPct: number
  highlighted: boolean
  onHover: () => void
  onLeave: () => void
  onSelect: () => void
}> = ({ row, widthPct, highlighted, onHover, onLeave, onSelect }) => {
  const name = useBankName(row.lenderAddress, row.fallbackName)
  const statusLabel = row.status === 'deposited' ? 'Deposited' : row.status === 'accepted' ? 'Accepted' : row.status === 'declined' ? 'Declined' : 'Pending'
  const tooltip = row.overflowCount ? `${row.overflowCount} more bids` : `${name} · ${statusLabel}`
  return (
    <div style={rowStyle(highlighted)} onMouseEnter={onHover} onMouseLeave={onLeave} onClick={onSelect} title={tooltip}>
      <div style={barStyle(widthPct, BID_BAR_COLOR)} />
      <span style={{ ...numericStyle, position: 'relative', color: 'var(--accent-green)', fontWeight: 700 }}>
        {row.price.toFixed(2)}%{row.status === 'deposited' ? ' ✓' : row.status === 'declined' ? ' ✕' : ''}
      </span>
      <span style={{ ...numericStyle, position: 'relative', textAlign: 'right' }}>{row.size.toLocaleString()}</span>
      <span style={{ ...numericStyle, position: 'relative', textAlign: 'right', color: bookTheme.textMuted }}>{row.total.toLocaleString()}</span>
    </div>
  )
}

interface OrderBookPanelProps {
  ask: Ask
  bids: Bid[]
  onSelectAmount: (amount: string) => void
}

export const OrderBookPanel: FC<OrderBookPanelProps> = ({ ask, bids, onSelectAmount }) => {
  const [hovered, setHovered] = useState<{ side: 'ask' | 'bid'; index: number } | null>(null)

  const target = Number(ask.amount) || 0
  const depositedTotal = bids.filter((b) => b.status === 'deposited').reduce((sum, b) => sum + Number(b.amount || 0), 0)
  const remaining = Math.max(0, target - depositedTotal)

  const askRows: AskRowData[] =
    remaining > 0
      ? [{ id: ask.id, price: ask.yieldRate, size: remaining, total: remaining, borrowerAddress: ask.borrowerAddress, fallbackName: ask.borrowerName || 'AT1 Bond', expiresAt: ask.expiresAt }]
      : []

  const sortedBids = [...bids].sort((a, b) => {
    const rank = (s?: string) => (s === 'deposited' ? 0 : s === 'accepted' ? 1 : s === 'pending' ? 2 : 3)
    return rank(a.status) - rank(b.status) || Number(b.amount) - Number(a.amount)
  })
  const maxBidRows = ROWS_PER_SIDE - 1
  const visible = sortedBids.slice(0, maxBidRows)
  const overflow = sortedBids.slice(maxBidRows)

  const bidRows: BidRowData[] = (() => {
    let cumulative = 0
    const rows: BidRowData[] = visible.map((bid) => {
      cumulative += Number(bid.amount || 0)
      return {
        id: bid.id,
        price: bid.targetYield ?? ask.yieldRate,
        size: Number(bid.amount || 0),
        total: cumulative,
        lenderAddress: bid.lenderAddress,
        fallbackName: bid.lenderName || 'Investor',
        status: bid.status,
        expiresAt: bid.expiresAt,
      }
    })
    if (overflow.length > 0) {
      const overflowSize = overflow.reduce((sum, b) => sum + Number(b.amount || 0), 0)
      cumulative += overflowSize
      rows.push({ id: '__overflow', price: ask.yieldRate, size: overflowSize, total: cumulative, overflowCount: overflow.length })
    }
    return rows
  })()

  const askBlanks = Math.max(0, ROWS_PER_SIDE - askRows.length)
  const bidBlanks = Math.max(0, ROWS_PER_SIDE - bidRows.length)
  const maxAskTotal = askRows.length > 0 ? askRows[askRows.length - 1].total : 1
  const maxBidTotal = bidRows.length > 0 ? bidRows[bidRows.length - 1].total : 1

  const isHighlighted = (side: 'ask' | 'bid', index: number) => {
    if (!hovered || hovered.side !== side) return false
    // Asks render worst-first (top) to best-last (bottom, nearest spread): everything
    // from the hovered row down to the spread is "between." Bids render best-first (top,
    // nearest spread) to worst-last: everything from the spread down to the hovered row.
    return side === 'ask' ? index >= hovered.index : index <= hovered.index
  }

  return (
    <div>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: bookTheme.textMuted, marginBottom: '0.5rem' }}>
        Order Book
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr 1fr',
          gap: '0.5rem',
          padding: '0 0.75rem 0.3rem',
          fontSize: '0.66rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
          color: bookTheme.textMuted,
        }}
      >
        <span>Price</span>
        <span style={{ textAlign: 'right' }}>Size (XRP)</span>
        <span style={{ textAlign: 'right' }}>Total (XRP)</span>
      </div>

      <div>
        {Array.from({ length: askBlanks }).map((_, i) => (
          <div key={`ask-blank-${i}`} style={{ height: '1.6rem' }} />
        ))}
        {askRows.map((row, i) => (
          <AskLevelRow
            key={row.id}
            row={row}
            widthPct={(row.total / maxAskTotal) * 100}
            highlighted={isHighlighted('ask', i)}
            onHover={() => setHovered({ side: 'ask', index: i })}
            onLeave={() => setHovered(null)}
            onSelect={() => onSelectAmount(String(row.size))}
          />
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr 1fr',
          gap: '0.5rem',
          alignItems: 'center',
          height: '1.9rem',
          padding: '0 0.75rem',
          borderTop: `1px solid ${bookTheme.border}`,
          borderBottom: `1px solid ${bookTheme.border}`,
          fontSize: '0.78rem',
          color: bookTheme.textMuted,
        }}
      >
        <span>Spread</span>
        <span style={{ ...numericStyle, textAlign: 'right' }}>0.00</span>
        <span style={{ ...numericStyle, textAlign: 'right' }}>0.00%</span>
      </div>

      <div>
        {bidRows.map((row, i) => (
          <BidLevelRow
            key={row.id}
            row={row}
            widthPct={(row.total / maxBidTotal) * 100}
            highlighted={isHighlighted('bid', i)}
            onHover={() => setHovered({ side: 'bid', index: i })}
            onLeave={() => setHovered(null)}
            onSelect={() => onSelectAmount(String(row.size))}
          />
        ))}
        {Array.from({ length: bidBlanks }).map((_, i) => (
          <div key={`bid-blank-${i}`} style={{ height: '1.6rem' }} />
        ))}
      </div>
    </div>
  )
}
