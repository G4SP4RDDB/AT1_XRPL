import { useEffect, useState } from 'react'
import { canLend } from '@/lib/roles'
import type { FC, FormEvent } from 'react'
import type { Bid, Ask } from '@shared/types'
import { chainClient } from '@/lib/chainClient'
import { useWallet } from '@/lib/wallet'
import { useBankName } from '@/lib/bankProfiles'
import { ResolvedName } from './ResolvedName'
import { OrderBookPanel } from './OrderBookPanel'
import { explorerTxUrl } from '@/lib/xrpl'
import { bookTheme } from '@/lib/orderBookTheme'
import { DURATION_OPTIONS, expiresAtFromNow, formatTimeRemaining, isExpired } from '@/lib/durations'
import { navigateToTrancheList } from '@/lib/hashRoute'

interface TranchePageProps {
  trancheId: string
}

/** A dedicated page per tranche (its own #/orderbook/<id> URL), modeled on
 * app.tenor.finance's per-market trading page: a two-sided book (this tranche's single Ask
 * plus the stack of LP Bids against it) on the left, a role-aware action panel on the right. */
export const TranchePage: FC<TranchePageProps> = ({ trancheId }) => {
  const { currentAccount } = useWallet()
  const lenderName = useBankName(currentAccount?.address, currentAccount?.name)

  const [bid, setBid] = useState<Bid | null>(null)
  const [asks, setAsks] = useState<Ask[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [bidAmount, setBidAmount] = useState('')
  const [bidDurationMs, setBidDurationMs] = useState<number>(DURATION_OPTIONS[1].ms)
  const [isSubmittingBid, setIsSubmittingBid] = useState(false)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [isOriginating, setIsOriginating] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null)

  const refresh = async () => {
    try {
      const [allBids, trancheAsks] = await Promise.all([chainClient.getBids(), chainClient.getAsks(trancheId)])
      setBid(allBids.find((b) => b.id === trancheId) ?? null)
      setAsks(trancheAsks)
    } catch (err) {
      console.error('Failed to load tranche:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setIsLoading(true)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trancheId])

  const panelStyle = { background: bookTheme.pageBg, border: `1px solid ${bookTheme.border}`, borderRadius: '20px', padding: '2rem' }

  if (isLoading) {
    return <div style={{ ...panelStyle, textAlign: 'center', color: bookTheme.textMuted }}>Loading tranche...</div>
  }

  if (!bid) {
    return (
      <div style={{ ...panelStyle, textAlign: 'center', color: bookTheme.textMuted }}>
        Tranche not found.
        <div style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={navigateToTrancheList}>
            ← Back to Order Book
          </button>
        </div>
      </div>
    )
  }

  const target = Number(bid.amount) || 0
  const filled = asks.filter((a) => a.status === 'deposited').reduce((sum, a) => sum + Number(a.amount || 0), 0)
  const fillFraction = target > 0 ? Math.min(1, filled / target) : 0
  const isOwner = Boolean(currentAccount && currentAccount.address === bid.borrowerAddress)
  const askExpired = isExpired(bid.expiresAt)

  const myPendingAsks = asks.filter((a) => a.lenderAddress === currentAccount?.address)

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
        expiresAt: expiresAtFromNow(bidDurationMs),
      })
      setBidAmount('')
      setFeedback({ kind: 'success', text: 'Bid placed — indicative only, nothing on-chain yet. Fund it below to actually deposit.' })
      refresh()
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
      setFeedback({ kind: 'success', text: `Deposited on-chain. TX ${res.txHash.slice(0, 12)}...` })
      refresh()
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
      refresh()
    } catch (err: any) {
      setFeedback({ kind: 'danger', text: err.message || 'Origination failed' })
    } finally {
      setIsOriginating(false)
    }
  }

  return (
    <div style={panelStyle}>
      <button
        type="button"
        onClick={navigateToTrancheList}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          marginBottom: '1.25rem',
          color: bookTheme.textSecondary,
          fontSize: '0.85rem',
          cursor: 'pointer',
        }}
      >
        ← Back to Order Book
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontFamily: bookTheme.serif, fontSize: '1.9rem', fontWeight: 400, margin: 0, color: 'var(--text-primary)' }}>
            <ResolvedName address={bid.borrowerAddress} fallback={bid.borrowerName || 'AT1 Bond'} />
          </h2>
          <span style={{ fontSize: '0.85rem', color: bookTheme.textSecondary }}>
            {Number(bid.amount).toLocaleString()} XRP · {bid.yieldRate}% · Call Date {new Date(bid.callDate).toLocaleDateString()}
          </span>
        </div>
        <span style={{ fontSize: '0.8rem', color: askExpired ? 'var(--accent-red)' : bookTheme.textSecondary, textAlign: 'right' }}>
          Bidding window: {formatTimeRemaining(bid.expiresAt)}
        </span>
      </div>

      <div style={{ background: bookTheme.panelBg, border: `1px solid ${bookTheme.border}`, borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 0 }}>
          {/* Left: mirrored Ask/Bids book, Hyperliquid-style */}
          <div style={{ padding: '1.25rem 1.5rem', borderRight: `1px solid ${bookTheme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: bookTheme.textSecondary }}>
                Filled {Number(filled).toLocaleString()} / {target.toLocaleString()} XRP
              </span>
              <span style={{ fontSize: '0.8rem', color: bookTheme.textMuted }}>{Math.round(fillFraction * 100)}%</span>
            </div>
            <div style={{ height: '6px', borderRadius: '9999px', background: bookTheme.pageBg, border: `1px solid ${bookTheme.border}`, overflow: 'hidden', marginBottom: '1.25rem' }}>
              <div style={{ width: `${Math.round(fillFraction * 100)}%`, height: '100%', background: fillFraction >= 1 ? 'var(--accent-green)' : 'var(--accent-blue)' }} />
            </div>

            <OrderBookPanel bid={bid} asks={asks} onSelectAmount={setBidAmount} />
          </div>

          {/* Right: role-aware action panel */}
          <div style={{ padding: '1.25rem 1.5rem' }}>
            {feedback && (
              <div className={`alert alert-${feedback.kind}`} style={{ marginBottom: '1rem', fontSize: '0.82rem' }}>
                {feedback.text}
              </div>
            )}

            {!currentAccount ? (
              <div style={{ color: bookTheme.textMuted, fontSize: '0.85rem' }}>Connect a wallet to bid or manage this tranche.</div>
            ) : isOwner ? (
              <div>
                <p style={{ fontSize: '0.85rem', color: bookTheme.textSecondary, marginBottom: '1rem' }}>
                  {fillFraction >= 1
                    ? 'This tranche is fully subscribed. Origination is automatic on the funding deposit; use this button only if it was skipped (e.g. 2/2 governance not active at the time).'
                    : `Needs ${Number(target - filled).toLocaleString()} more XRP; the loan is originated automatically by the deposit that fills it.`}
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
            ) : !canLend(currentAccount.role) ? (
              <div style={{ color: bookTheme.textMuted, fontSize: '0.85rem' }}>
                Only investor (lender) accounts can bid on and fund a tranche. This account is registered as
                {currentAccount.role === 'borrower' ? ' an issuer' : currentAccount.role === 'broker' ? ' the platform broker' : ' not onboarded yet'}.
              </div>
            ) : (
              <div>
                <form onSubmit={handlePlaceBid} style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">Place a Bid (XRP)</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                      type="number"
                      className="form-input"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      min="1"
                      placeholder="e.g. 25000"
                      required
                      disabled={askExpired}
                    />
                    <button type="submit" className="btn btn-primary" disabled={isSubmittingBid || !bidAmount || askExpired}>
                      {isSubmittingBid ? 'Placing...' : 'Bid'}
                    </button>
                  </div>
                  <select
                    className="form-select"
                    value={bidDurationMs}
                    onChange={(e) => setBidDurationMs(Number(e.target.value))}
                    disabled={askExpired}
                  >
                    {DURATION_OPTIONS.map((opt) => (
                      <option key={opt.label} value={opt.ms}>
                        Valid for {opt.label}
                      </option>
                    ))}
                  </select>
                  <p style={{ fontSize: '0.72rem', color: bookTheme.textMuted, marginTop: '0.4rem' }}>
                    {askExpired ? "This tranche's bidding window has closed." : 'Off-chain and indicative — you fund it explicitly afterwards.'}
                  </p>
                </form>

                {myPendingAsks.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: bookTheme.textSecondary, marginBottom: '0.5rem' }}>
                      Your bids on this tranche
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {myPendingAsks.map((ask) => {
                        const myBidExpired = isExpired(ask.expiresAt)
                        return (
                          <div
                            key={ask.id}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '8px', border: `1px solid ${bookTheme.border}` }}
                          >
                            <span style={{ fontSize: '0.82rem' }}>{Number(ask.amount).toLocaleString()} XRP</span>
                            {ask.status === 'pending' ? (
                              <button
                                type="button"
                                className="btn btn-success btn-sm"
                                disabled={pendingActionId === ask.id || myBidExpired}
                                onClick={() => handleFundNow(ask.id)}
                              >
                                {myBidExpired ? 'Expired' : pendingActionId === ask.id ? 'Funding...' : 'Fund Now'}
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-green)' }}>Deposited</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {bid.vaultId && (
              <div style={{ marginTop: '1.25rem', fontSize: '0.75rem' }}>
                <a href={explorerTxUrl(bid.vaultId)} target="_blank" rel="noreferrer" style={{ color: bookTheme.textMuted }}>
                  View vault on explorer &rarr;
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
