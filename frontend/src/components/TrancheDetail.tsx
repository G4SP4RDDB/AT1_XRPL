import { useState } from 'react'
import type { FC, FormEvent } from 'react'
import type { Bid, Ask } from '@shared/types'
import { chainClient } from '@/lib/chainClient'
import { useWallet } from '@/lib/wallet'
import { useBankName } from '@/lib/bankProfiles'
import { ResolvedName } from './ResolvedName'
import { explorerTxUrl } from '@/lib/xrpl'

interface TrancheDetailProps {
  bid: Bid
  asks: Ask[]
  onRefresh: () => void
  onClose: () => void
}

const STATUS_LABEL: Record<string, string> = { pending: 'Pending', matched: 'Matched', deposited: 'Deposited' }

export const TrancheDetail: FC<TrancheDetailProps> = ({ bid, asks, onRefresh, onClose }) => {
  const { currentAccount } = useWallet()
  const lenderName = useBankName(currentAccount?.address, currentAccount?.name)

  const [bidAmount, setBidAmount] = useState('')
  const [isSubmittingBid, setIsSubmittingBid] = useState(false)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [isOriginating, setIsOriginating] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null)

  const target = Number(bid.amount) || 0
  const filled = asks.filter((a) => a.status === 'deposited').reduce((sum, a) => sum + Number(a.amount || 0), 0)
  const fillFraction = target > 0 ? Math.min(1, filled / target) : 0
  const isOwner = Boolean(currentAccount && currentAccount.address === bid.borrowerAddress)

  const depthRows: Array<{ ask: Ask; barFraction: number }> = (() => {
    const sorted = [...asks].sort((a, b) => {
      const rank = (s?: string) => (s === 'deposited' ? 0 : s === 'matched' ? 1 : 2)
      return rank(a.status) - rank(b.status) || Number(b.amount) - Number(a.amount)
    })
    let cumulative = 0
    return sorted.map((ask) => {
      if (ask.status === 'deposited') cumulative += Number(ask.amount || 0)
      return { ask, barFraction: target > 0 ? Math.min(1, cumulative / target) : 0 }
    })
  })()

  const handlePlaceBid = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentAccount || !bidAmount) return
    setIsSubmittingBid(true)
    setFeedback(null)
    try {
      await chainClient.createAsk({
        lenderAddress: currentAccount.address,
        lenderName,
        amount: bidAmount,
        targetYield: bid.yieldRate,
        bidId: bid.id,
      })
      setBidAmount('')
      setFeedback({ kind: 'success', text: 'Bid placed — indicative only, nothing on-chain yet. Fund it below to actually deposit.' })
      onRefresh()
    } catch (err: any) {
      setFeedback({ kind: 'danger', text: err.message || 'Failed to place bid' })
    } finally {
      setIsSubmittingBid(false)
    }
  }

  const handleFundNow = async (askId: string) => {
    setPendingActionId(askId)
    setFeedback(null)
    try {
      const res = await chainClient.acceptBid(askId)
      setFeedback({
        kind: 'success',
        text: `Deposited on-chain. TX ${res.txHash.slice(0, 12)}...`,
      })
      onRefresh()
    } catch (err: any) {
      setFeedback({ kind: 'danger', text: err.message || 'Deposit failed' })
    } finally {
      setPendingActionId(null)
    }
  }

  const handleOriginate = async () => {
    setIsOriginating(true)
    setFeedback(null)
    try {
      const res = await chainClient.originateTranche(bid.id)
      setFeedback({
        kind: 'success',
        text: res.loanId ? `Loan originated (${res.loanId}). TX ${res.txHash.slice(0, 12)}...` : `Origination submitted. TX ${res.txHash.slice(0, 12)}...`,
      })
      onRefresh()
    } catch (err: any) {
      setFeedback({ kind: 'danger', text: err.message || 'Origination failed' })
    } finally {
      setIsOriginating(false)
    }
  }

  const myPendingAsks = asks.filter((a) => a.lenderAddress === currentAccount?.address)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <h3 className="card-title" style={{ fontSize: '1.15rem' }}>
            <ResolvedName address={bid.borrowerAddress} fallback={bid.borrowerName || 'AT1 Bond'} />
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {Number(bid.amount).toLocaleString()} XRP · {bid.yieldRate}% · Maturity {new Date(bid.callDate).toLocaleDateString()}
          </span>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
          Close
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 0 }}>
        {/* Left: depth list */}
        <div style={{ padding: '1.25rem 1.5rem', borderRight: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Filled {Number(filled).toLocaleString()} / {target.toLocaleString()} XRP
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{Math.round(fillFraction * 100)}%</span>
          </div>
          <div style={{ height: '8px', borderRadius: '9999px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', overflow: 'hidden', marginBottom: '1.25rem' }}>
            <div style={{ width: `${Math.round(fillFraction * 100)}%`, height: '100%', background: fillFraction >= 1 ? 'var(--accent-green)' : 'var(--accent-blue)' }} />
          </div>

          {depthRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No bids yet on this tranche.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {depthRows.map(({ ask, barFraction }) => {
                return (
                  <div
                    key={ask.id}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      overflow: 'hidden',
                    }}
                  >
                    {ask.status === 'deposited' && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: `${Math.round(barFraction * 100)}%`,
                          background: 'rgba(5, 150, 105, 0.08)',
                          zIndex: 0,
                        }}
                      />
                    )}
                    <span style={{ position: 'relative', zIndex: 1, fontSize: '0.85rem', fontWeight: 600 }}>
                      <ResolvedName address={ask.lenderAddress} fallback={ask.lenderName || 'Investor'} />
                    </span>
                    <span style={{ position: 'relative', zIndex: 1, fontSize: '0.85rem' }}>{Number(ask.amount).toLocaleString()} XRP</span>
                    <span
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '0.1rem 0.5rem',
                        borderRadius: '9999px',
                        color: ask.status === 'deposited' ? 'var(--accent-green)' : 'var(--text-muted)',
                        background: ask.status === 'deposited' ? 'rgba(5, 150, 105, 0.12)' : 'var(--bg-surface-elevated)',
                      }}
                    >
                      {STATUS_LABEL[ask.status ?? 'pending']}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: action panel */}
        <div style={{ padding: '1.25rem 1.5rem' }}>
          {feedback && (
            <div className={`alert alert-${feedback.kind}`} style={{ marginBottom: '1rem', fontSize: '0.82rem' }}>
              {feedback.text}
            </div>
          )}

          {!currentAccount ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Connect a wallet to bid or manage this tranche.</div>
          ) : isOwner ? (
            <div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                {fillFraction >= 1
                  ? 'This tranche is fully subscribed. You can originate the loan now.'
                  : `Needs ${Number(target - filled).toLocaleString()} more XRP before origination.`}
              </p>
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={isOriginating || fillFraction < 1 || bid.status === 'originated'}
                onClick={handleOriginate}
              >
                {bid.status === 'originated' ? 'Already Originated' : isOriginating ? 'Originating...' : 'Originate Loan'}
              </button>
            </div>
          ) : (
            <div>
              <form onSubmit={handlePlaceBid} style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Place a Bid (XRP)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="number"
                    className="form-input"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    min="1"
                    placeholder="e.g. 25000"
                    required
                  />
                  <button type="submit" className="btn btn-primary" disabled={isSubmittingBid || !bidAmount}>
                    {isSubmittingBid ? 'Placing...' : 'Bid'}
                  </button>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                  Off-chain and indicative — you fund it explicitly afterwards.
                </p>
              </form>

              {myPendingAsks.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    Your bids on this tranche
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {myPendingAsks.map((ask) => (
                      <div key={ask.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: '0.82rem' }}>{Number(ask.amount).toLocaleString()} XRP</span>
                        {ask.status === 'pending' ? (
                          <button
                            type="button"
                            className="btn btn-success btn-sm"
                            disabled={pendingActionId === ask.id}
                            onClick={() => handleFundNow(ask.id)}
                          >
                            {pendingActionId === ask.id ? 'Funding...' : 'Fund Now'}
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-green)' }}>Deposited</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {bid.vaultId && (
            <div style={{ marginTop: '1.25rem', fontSize: '0.75rem' }}>
              <a href={explorerTxUrl(bid.vaultId)} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)' }}>
                View vault on explorer &rarr;
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
