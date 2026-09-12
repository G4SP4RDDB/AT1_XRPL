import { useState } from 'react'
import type { FC } from 'react'
import type { Bid, Ask } from '@shared/types'
import { chainClient } from '@/lib/chainClient'
import { explorerTxUrl } from '@/lib/xrpl'

interface MatchBoardProps {
  bids: Bid[]
  asks: Ask[]
  onMatchExecuted: () => void
}

export const MatchBoard: FC<MatchBoardProps> = ({ bids, asks, onMatchExecuted }) => {
  const [matchingPair, setMatchingPair] = useState<{ bidId: string; askId: string } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [matchResult, setMatchResult] = useState<{ vaultId: string; txHash: string } | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)

  const openBids = bids.filter((b) => b.status === 'open')
  const pendingAsks = asks.filter((a) => a.status === 'pending')

  const handleExecuteMatch = async (bidId: string, askId: string) => {
    setIsProcessing(true)
    setMatchError(null)
    setMatchResult(null)

    try {
      const res = await chainClient.matchAndDeposit(bidId, askId)
      setMatchResult(res)
      onMatchExecuted()
    } catch (err: any) {
      setMatchError(err.message || 'Failed to execute match')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {matchResult && (
        <div className="alert alert-success">
          <strong>Match Executed On-Ledger!</strong>
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            Vault created: <code>{matchResult.vaultId}</code> | On-Chain TX:
            <a
              href={explorerTxUrl(matchResult.txHash)}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent-blue)', marginLeft: '0.5rem', textDecoration: 'underline' }}
            >
              {matchResult.txHash}
            </a>
          </div>
          <div style={{ marginTop: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            Funds transferred via <code>VaultDeposit</code> & loan drawn down to borrower. Principal is now locked until call date.
          </div>
        </div>
      )}

      {matchError && (
        <div className="alert alert-danger">
          {matchError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Open Bids Column */}
        <div>
          <h3 className="section-title" style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
            Borrower Bids ({openBids.length})
          </h3>
          {openBids.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              No open bids at this moment. Emit a new bid above.
            </div>
          ) : (
            openBids.map((bid) => (
              <div key={bid.id} className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header">
                  <div>
                    <h4 className="card-title" style={{ fontSize: '1rem' }}>
                      {bid.borrowerName || 'Borrower Bid'}
                    </h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {bid.borrowerAddress.slice(0, 10)}...{bid.borrowerAddress.slice(-6)}
                    </span>
                  </div>
                  <span className="card-tag tag-open">{bid.status}</span>
                </div>

                <div className="metric-row">
                  <span className="metric-label">Principal</span>
                  <span className="metric-val">{Number(bid.amount).toLocaleString()} XRP</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">Offered Coupon</span>
                  <span className="metric-val highlight-green">{bid.yieldRate}% APY</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">Agreed Call Date</span>
                  <span className="metric-val highlight-amber">{bid.callDate}</span>
                </div>

                <div style={{ marginTop: '1rem' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    {bid.description}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Indicative Asks Column */}
        <div>
          <h3 className="section-title" style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
            Indicative Lender Asks ({pendingAsks.length})
          </h3>
          {pendingAsks.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              No pending asks. Post capital interest above.
            </div>
          ) : (
            pendingAsks.map((ask) => (
              <div key={ask.id} className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header">
                  <div>
                    <h4 className="card-title" style={{ fontSize: '1rem' }}>
                      {ask.lenderName || 'Institutional Lender'}
                    </h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {ask.lenderAddress.slice(0, 10)}...{ask.lenderAddress.slice(-6)}
                    </span>
                  </div>
                  <span className="card-tag tag-matched">Indicative</span>
                </div>

                <div className="metric-row">
                  <span className="metric-label">Capital Committed</span>
                  <span className="metric-val">{Number(ask.amount).toLocaleString()} XRP</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">Min. Required Yield</span>
                  <span className="metric-val">{ask.targetYield ? `${ask.targetYield}%` : 'Market rate'}</span>
                </div>

                {/* Match Action trigger */}
                <div style={{ marginTop: '1rem' }}>
                  {openBids.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>
                        Align With Bid & Execute On-Chain:
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <select
                          className="form-select"
                          style={{ fontSize: '0.8rem', padding: '0.4rem' }}
                          onChange={(e) => {
                            if (e.target.value) setMatchingPair({ bidId: e.target.value, askId: ask.id })
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Select bid to pair...</option>
                          {openBids.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.borrowerName || b.id} ({b.yieldRate}% | {b.amount} XRP)
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={isProcessing || !matchingPair || matchingPair.askId !== ask.id}
                          onClick={() => {
                            if (matchingPair) handleExecuteMatch(matchingPair.bidId, matchingPair.askId)
                          }}
                        >
                          {isProcessing ? 'Executing...' : 'Match & Deposit'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
