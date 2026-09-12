import { useState } from 'react'
import type { FC } from 'react'
import type { VaultState, UserPosition } from '@shared/types'
import { WithdrawModal } from './WithdrawModal'
import { CouponModal } from './CouponModal'
import { MultisigRepayModal } from './MultisigRepayModal'
import { ResolvedName } from './ResolvedName'
import { explorerAccountUrl } from '@/lib/xrpl'

interface VaultCardProps {
  vault: VaultState
  userPosition: UserPosition | null
  onRefresh: () => void
}

export const VaultCard: FC<VaultCardProps> = ({ vault, userPosition, onRefresh }) => {
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [showCoupon, setShowCoupon] = useState(false)
  const [showRepay, setShowRepay] = useState(false)

  const isPrincipalLocked = Number(vault.loanPrincipal) > 0 && vault.loanStatus === 'active'

  // Calculate call date countdown
  const now = new Date()
  const targetDate = new Date(vault.callDate)
  const daysRemaining = Math.max(0, Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{vault.vaultId}</span>
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }} title={vault.borrowerAddress}>
            Borrower: {vault.borrowerAddress ? <ResolvedName address={vault.borrowerAddress} /> : 'Issuer'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {isPrincipalLocked ? (
            <span className="card-tag tag-locked">Principal Out on Loan</span>
          ) : (
            <span className="card-tag tag-active">Liquid Vault</span>
          )}
          <span className="card-tag tag-open">{vault.loanInterestRate}% Coupon</span>
        </div>
      </div>

      {/* Lock banner */}
      <div className="lock-banner">
        <div className="lock-status">
          <span style={{ fontSize: '1.1rem' }}>{isPrincipalLocked ? '🔒' : '🔓'}</span>
          <span>
            {isPrincipalLocked
              ? `Call Date Lock: ${daysRemaining} days remaining (${vault.callDate})`
              : 'Principal Repaid & Unlocked'}
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>Multisig Gated</span>
      </div>

      {/* Financial Metrics */}
      <div className="metric-row">
        <span className="metric-label">Price Per Share (PPS)</span>
        <span className="metric-val highlight-green">{vault.pps.toFixed(5)} XRP/share</span>
      </div>

      <div className="metric-row">
        <span className="metric-label">Total Vault Assets</span>
        <span className="metric-val">{Number(vault.assetsTotal).toLocaleString()} XRP</span>
      </div>

      <div className="metric-row">
        <span className="metric-label">Principal Out on Loan</span>
        <span className="metric-val highlight-amber">{Number(vault.loanPrincipal).toLocaleString()} XRP</span>
      </div>

      <div className="metric-row">
        <span className="metric-label">Liquid Assets in Vault</span>
        <span className="metric-val highlight-cyan">{Number(vault.liquidAssets).toLocaleString()} XRP</span>
      </div>

      <div className="metric-row">
        <span className="metric-label">Broker First-Loss Cover</span>
        <span className="metric-val">{Number(vault.firstLossCover).toLocaleString()} XRP</span>
      </div>

      {/* Active User Position Subcard */}
      {userPosition && (
        <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '0.85rem', margin: '1rem 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
              YOUR POSITION
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {Number(userPosition.sharesOwned).toLocaleString()} shares
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span>Position Value: <strong>{Number(userPosition.currentValue).toLocaleString()} XRP</strong></span>
            <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>
              Yield: +{Number(userPosition.accruedYield).toLocaleString()} XRP
            </span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '1.25rem' }}>
        <button
          type="button"
          className="btn btn-success btn-sm"
          onClick={() => setShowWithdraw(true)}
        >
          Withdraw / Guardrail
        </button>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowCoupon(true)}
        >
          Pay Coupon
        </button>
      </div>

      <div style={{ marginTop: '0.5rem' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm btn-block"
          onClick={() => setShowRepay(true)}
        >
          Multisig Final Repay Gate
        </button>
      </div>

      <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
        <a
          href={vault.borrowerAddress ? explorerAccountUrl(vault.borrowerAddress) : '#'}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          View on Hackathon Explorer &rarr;
        </a>
      </div>

      {/* Modals */}
      {showWithdraw && (
        <WithdrawModal
          vault={vault}
          position={userPosition}
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => {
            onRefresh()
          }}
        />
      )}

      {showCoupon && (
        <CouponModal
          vault={vault}
          onClose={() => setShowCoupon(false)}
          onSuccess={() => {
            onRefresh()
          }}
        />
      )}

      {showRepay && (
        <MultisigRepayModal
          vault={vault}
          onClose={() => setShowRepay(false)}
          onSuccess={() => {
            onRefresh()
          }}
        />
      )}
    </div>
  )
}
