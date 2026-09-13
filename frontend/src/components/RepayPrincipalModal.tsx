import { useState } from 'react'
import type { FC } from 'react'
import type { VaultState } from '@shared/types'
import { chainClient } from '@/lib/chainClient'
import { explorerTxUrl } from '@/lib/xrpl'

interface RepayPrincipalModalProps {
  vault: VaultState
  onClose: () => void
  onSuccess: () => void
}

/** Partial principal repayment (LoanPay tfLoanOverpayment), the issuer's own amount. The enforcer
 *  refuses it before the call date; after it, repaying is the issuer's decision, never an obligation. */
export const RepayPrincipalModal: FC<RepayPrincipalModalProps> = ({ vault, onClose, onSuccess }) => {
  const outstanding = Number(vault.loan?.principalOutstanding ?? 0)
  const [amount, setAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; txHash?: string; error?: string } | null>(null)
  const callReached = vault.isCallDateReached ?? false

  const handleRepay = async () => {
    setIsSubmitting(true)
    setResult(null)
    try {
      const res = await chainClient.repayPrincipal(vault.vaultId, amount)
      setResult(res)
      if (res.success) onSuccess()
    } catch (err: any) {
      setResult({ success: false, error: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <h3 className="card-title">Repay Principal (partial, Multisig Gate)</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{vault.vaultId}</span>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
          <div className="metric-row">
            <span className="metric-label">Principal outstanding</span>
            <span className="metric-val">{outstanding.toLocaleString(undefined, { maximumFractionDigits: 6 })} XRP</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Call date</span>
            <span className="metric-val highlight-amber">{vault.callDate ? new Date(vault.callDate).toLocaleString() : '—'}{callReached ? ' · reached' : ' · not yet'}</span>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Amount to repay (XRP)</label>
          <input type="number" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} min="1" step="1" placeholder={`up to ${outstanding.toFixed(0)}`} />
        </div>

        <div className="alert alert-info">
          <p style={{ margin: 0, fontSize: '0.8rem' }}>
            <code>LoanPay</code> with <code>tfLoanOverpayment</code>: principal comes back into the vault. Before the call date the
            Enforcer refuses to co-sign (<code>blocked: before-call-date</code>): that refusal <em>is</em> the bond's lock. After the
            call date, repaying, in part or in full, is your decision, never an obligation. An amount covering the whole principal calls the bond.
          </p>
        </div>

        {result && (
          <div className={`alert ${result.success ? 'alert-success' : 'alert-danger'}`}>
            {result.success ? (
              <>Principal repaid. {result.txHash && <a href={explorerTxUrl(result.txHash)} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{result.txHash}</a>}</>
            ) : result.error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button type="button" className="btn btn-primary btn-block" onClick={handleRepay} disabled={isSubmitting || !(Number(amount) > 0)}>
            {isSubmitting ? 'Broadcasting LoanPay...' : `Repay ${amount || '…'} XRP of principal`}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
