import { useState } from 'react'
import type { FC } from 'react'
import type { VaultState } from '@shared/types'
import { chainClient } from '@/lib/chainClient'
import { explorerTxUrl } from '@/lib/xrpl'

interface CouponModalProps {
  vault: VaultState
  onClose: () => void
  onSuccess: () => void
}

/** Pays the loan's next scheduled instalment. The amount is never chosen here: an XLS-66 loan is an
 *  amortising schedule (PaymentTotal instalments of PeriodicPayment, each carrying a slice of the
 *  principal plus the interest of the period), the enforcer only co-signs that exact figure, and
 *  the ledger rejects anything else. The modal shows what will leave the issuer's account. */
export const CouponModal: FC<CouponModalProps> = ({ vault, onClose, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [txResult, setTxResult] = useState<{ newPps: number; txHash: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loan = vault.loan
  const instalment = Number(loan?.periodicPayment ?? 0)
  const remaining = loan?.paymentRemaining ?? 0
  const principalPart = remaining > 0 ? Number(loan?.principalOutstanding ?? 0) / remaining : 0
  const interestPart = Math.max(0, instalment - principalPart)
  const dueDate = loan?.nextPaymentDueDate ? new Date(loan.nextPaymentDueDate) : null
  const overdue = dueDate ? dueDate.getTime() < Date.now() : false

  const handlePay = async () => {
    setIsSubmitting(true)
    setError(null)
    setTxResult(null)
    try {
      const res = await chainClient.payCoupon(vault.vaultId)
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
            <h3 className="card-title">Borrower: Pay Interest (next instalment, LoanPay)</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{vault.vaultId}</span>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {loan && remaining > 0 ? (
          <div className="card" style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--bg-surface-elevated)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Scheduled instalment</span>
              <strong style={{ textAlign: 'right' }}>{instalment.toLocaleString(undefined, { maximumFractionDigits: 6 })} XRP</strong>
              <span style={{ color: 'var(--text-secondary)' }}>of which principal ≈</span>
              <span style={{ textAlign: 'right' }}>{principalPart.toLocaleString(undefined, { maximumFractionDigits: 6 })} XRP</span>
              <span style={{ color: 'var(--text-secondary)' }}>of which interest ≈</span>
              <span style={{ textAlign: 'right', color: 'var(--accent-green)' }}>{interestPart.toLocaleString(undefined, { maximumFractionDigits: 6 })} XRP</span>
              <span style={{ color: 'var(--text-secondary)' }}>Instalments remaining</span>
              <span style={{ textAlign: 'right' }}>{remaining.toLocaleString()} (until the bond is called)</span>
              <span style={{ color: 'var(--text-secondary)' }}>Due</span>
              <span style={{ textAlign: 'right', color: overdue ? 'var(--accent-red)' : 'inherit' }}>
                {dueDate ? dueDate.toLocaleString() : '—'}{overdue ? ' · overdue (late fee applies)' : ''}
              </span>
            </div>
          </div>
        ) : (
          <div className="alert alert-warning">No active loan on this vault: nothing to pay.</div>
        )}

        <div className="alert alert-info">
          <strong>Why the amount is fixed:</strong>
          <p style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}>
            XLS-66 has no interest-only coupon: every <code>LoanPay</code> is the period's interest plus a sliver of principal
            (1/10,000 here), computed by the ledger (<code>PeriodicPayment</code>). The enforcer co-signs that exact figure only. The
            interest lands in the vault and raises the price per share for every depositor. Principal is repaid separately, on your
            initiative, from the call date on.
          </p>
        </div>

        {txResult && (
          <div className="alert alert-success">
            <strong>Instalment paid on-chain.</strong>
            <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Vault PPS is now <strong>{txResult.newPps.toFixed(6)}</strong>.
            </div>
            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              TX Hash: <a href={explorerTxUrl(txResult.txHash)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}>{txResult.txHash}</a>
            </div>
          </div>
        )}

        {error && <div className="alert alert-danger">{error}</div>}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handlePay}
            disabled={isSubmitting || !loan || remaining === 0}
          >
            {isSubmitting ? 'Broadcasting LoanPay...' : `Pay instalment (${instalment.toLocaleString(undefined, { maximumFractionDigits: 2 })} XRP)`}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
