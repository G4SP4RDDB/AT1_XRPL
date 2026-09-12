import { useState, useEffect } from 'react'
import type { FC } from 'react'
import type { Bid } from '@shared/types'
import { useWallet } from '@/lib/wallet'
import { chainClient } from '@/lib/chainClient'
import { explorerTxUrl } from '@/lib/xrpl'
import { ResolvedName } from './ResolvedName'

interface FinanceBondsProps {
  onFundSuccess: () => void
}

export const FinanceBonds: FC<FinanceBondsProps> = ({ onFundSuccess }) => {
  const { currentAccount } = useWallet()
  const [bids, setBids] = useState<Bid[]>([])
  const [fundingBidId, setFundingBidId] = useState<string | null>(null)
  const [investAmount, setInvestAmount] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [successInfo, setSuccessInfo] = useState<{ vaultId: string; txHash: string } | null>(null)

  const loadBids = async () => {
    const all = await chainClient.getBids()
    setBids(all.filter((b) => b.status === 'open'))
  }

  useEffect(() => {
    loadBids()
  }, [])

  const handleFund = async (bid: Bid) => {
    if (!currentAccount) return
    setIsProcessing(true)
    setSuccessInfo(null)

    const amountToInvest = investAmount || bid.amount

    try {
      const res = await chainClient.fundBond(bid.id, currentAccount.address, amountToInvest)
      setSuccessInfo(res)
      setFundingBidId(null)
      setInvestAmount('')
      await loadBids()
      onFundSuccess()
    } catch (err: any) {
      alert(`Funding error: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="section-header">
        <div>
          <h3 className="section-title">Finance Bonds</h3>
          <p className="section-subtitle">
            Select an active bond issuance to deposit capital via <code>VaultDeposit</code>
          </p>
        </div>
      </div>

      {successInfo && (
        <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
          <strong>Deposit Successful!</strong>
          <div style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
            You funded the bond. Vault <code>{successInfo.vaultId}</code> minted your shares (MPT).
          </div>
          <div style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}>
            TX Hash: <a href={explorerTxUrl(successInfo.txHash)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}>{successInfo.txHash}</a>
          </div>
        </div>
      )}

      {bids.length === 0 ? (
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {bids.map((bid) => (
            <div key={bid.id} className="card">
              <div className="card-header">
                <div>
                  <h4 className="card-title" style={{ fontSize: '1.15rem' }}>
                    <ResolvedName address={bid.borrowerAddress} fallback={bid.borrowerName || 'AT1 Bond'} />
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }} title={bid.borrowerAddress}>
                    Issuer: {bid.borrowerAddress.slice(0, 10)}...{bid.borrowerAddress.slice(-6)}
                  </span>
                </div>
                <span className="card-tag tag-open">Open</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', margin: '1.25rem 0', background: 'var(--bg-surface-elevated)', padding: '1rem 1.2rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Target Principal</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '0.2rem', color: 'var(--text-primary)' }}>{Number(bid.amount).toLocaleString()} XRP</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Annual Coupon</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '0.2rem', color: 'var(--accent-green)' }}>{bid.yieldRate}% APY</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Call Date</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '0.2rem', color: 'var(--accent-amber)' }}>{bid.callDate}</div>
                </div>
              </div>

              {bid.description && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                  {bid.description}
                </p>
              )}

              {fundingBidId === bid.id ? (
                <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '1rem' }}>
                  <label className="form-label">Amount to fund (XRP)</label>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <input
                      type="number"
                      className="form-input"
                      placeholder={`Max: ${bid.amount}`}
                      value={investAmount}
                      onChange={(e) => setInvestAmount(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={isProcessing}
                      onClick={() => handleFund(bid)}
                    >
                      {isProcessing ? 'Depositing...' : 'Confirm Deposit'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setFundingBidId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => {
                    setFundingBidId(bid.id)
                    setInvestAmount(bid.amount)
                  }}
                >
                  Fund this Bond
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
