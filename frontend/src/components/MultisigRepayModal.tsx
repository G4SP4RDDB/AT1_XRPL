import { useState } from 'react'
import type { FC } from 'react'
import type { VaultState } from '@shared/types'
import { mockChainClient } from '@/lib/chainClient'
import { explorerTxUrl } from '@/lib/xrpl'

interface MultisigRepayModalProps {
  vault: VaultState
  onClose: () => void
  onSuccess: () => void
}

export const MultisigRepayModal: FC<MultisigRepayModalProps> = ({
  vault,
  onClose,
  onSuccess,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [overrideCallDate, setOverrideCallDate] = useState(false)
  const [result, setResult] = useState<{ success: boolean; txHash?: string; error?: string } | null>(null)

  const handleRepay = async () => {
    setIsSubmitting(true)
    setResult(null)

    try {
      const res = await mockChainClient.executeMultisigRepay(vault.vaultId, overrideCallDate)
      setResult(res)
      if (res.success) {
        onSuccess()
      }
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
            <h3 className="card-title">Final Principal Repayment (Multisig Gate)</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{vault.vaultId}</span>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
          <div className="metric-row">
            <span className="metric-label">Loan Principal Owed</span>
            <span className="metric-val">{Number(vault.loanPrincipal).toLocaleString()} XRP</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Enforced Call Date</span>
            <span className="metric-val highlight-amber">{vault.callDate}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Multisig Signer Quorum</span>
            <span className="metric-val highlight-cyan">2-of-2 (Broker + Scheduler)</span>
          </div>
        </div>

        <div className="alert alert-warning">
          <strong>Multisig Call-Date Policy:</strong>
          <p style={{ marginTop: '0.3rem', fontSize: '0.8rem' }}>
            The final <code>LoanPay</code> repayment transaction clearing the principal requires co-signatures from the platform broker and scheduling key. By policy, signers will refuse co-signing if ledger time is before the call date.
          </p>
        </div>

        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input
            type="checkbox"
            id="overrideCall"
            checked={overrideCallDate}
            onChange={(e) => setOverrideCallDate(e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
          <label htmlFor="overrideCall" style={{ fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
            <strong>[Demo Toggle]</strong> Fast-forward time to simulate reaching the call date ({vault.callDate})
          </label>
        </div>

        {result && !result.success && (
          <div className="alert alert-danger" style={{ fontSize: '0.8rem' }}>
            <strong>[Call Date Policy Enforcement]</strong>
            <p style={{ marginTop: '0.3rem' }}>{result.error}</p>
          </div>
        )}

        {result && result.success && (
          <div className="alert alert-success">
            <strong>Multisig Clearance Granted & Loan Repaid!</strong>
            <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Broker and scheduler signers co-signed the final LoanPay. Principal of {vault.loanPrincipal} XRP returned to the vault. Liquid assets unlocked for depositor redemption!
            </div>
            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              TX Hash: <a href={explorerTxUrl(result.txHash!)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}>{result.txHash}</a>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleRepay}
            disabled={isSubmitting || vault.loanStatus === 'repaid'}
          >
            {isSubmitting
              ? 'Collecting Signatures...'
              : vault.loanStatus === 'repaid'
              ? 'Loan Fully Repaid'
              : 'Execute Gated LoanPay Repayment'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
