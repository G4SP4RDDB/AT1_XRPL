import { useState } from 'react'
import type { FC } from 'react'
import type { VaultState } from '@shared/types'
import { mockChainClient } from '@/lib/chainClient'
import { explorerTxUrl } from '@/lib/xrpl'

interface CouponModalProps {
  vault: VaultState
  onClose: () => void
  onSuccess: () => void
}

export const CouponModal: FC<CouponModalProps> = ({ vault, onClose, onSuccess }) => {
  const defaultCoupon = vault.loanPrincipal && vault.loanInterestRate
    ? ((Number(vault.loanPrincipal) * Number(vault.loanInterestRate)) / 100 / 2).toFixed(2)
    : ''
  const [couponAmount, setCouponAmount] = useState(defaultCoupon)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [txResult, setTxResult] = useState<{ newPps: number; txHash: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePayCoupon = async () => {
    setIsSubmitting(true)
    setError(null)
    setTxResult(null)

    try {
      const res = await mockChainClient.payCoupon(vault.vaultId, couponAmount)
      setTxResult(res)
      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <h3 className="card-title">Borrower: Distribute Coupon (LoanPay)</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{vault.vaultId}</span>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="form-group">
          <label className="form-label">Coupon Payment Amount (XRP)</label>
          <input
            type="number"
            className="form-input"
            value={couponAmount}
            onChange={(e) => setCouponAmount(e.target.value)}
            required
            min="10"
            step="100"
          />
        </div>

        <div className="alert alert-info">
          <strong>Passive Yield Accrual Mechanics:</strong>
          <p style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}>
            Broadcasting <code>LoanPay</code> injects capital into the vault without minting new shares. This directly elevates <code>AssetsTotal</code>, automatically increasing the Price Per Share (<strong>PPS</strong>) for all depositors pro-rata.
          </p>
        </div>

        {txResult && (
          <div className="alert alert-success">
            <strong>Coupon Dispatched On-Chain!</strong>
            <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Vault PPS surged to <strong>{txResult.newPps.toFixed(5)}</strong>.
            </div>
            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              TX Hash: <a href={explorerTxUrl(txResult.txHash)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}>{txResult.txHash}</a>
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-danger">
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handlePayCoupon}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Broadcasting LoanPay...' : `Pay Coupon (${couponAmount} XRP)`}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
