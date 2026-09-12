import { useState } from 'react'
import type { FC } from 'react'
import type { VaultState, UserPosition } from '@shared/types'
import { mockChainClient } from '@/lib/chainClient'
import { explorerTxUrl } from '@/lib/xrpl'

interface WithdrawModalProps {
  vault: VaultState
  position: UserPosition | null
  onClose: () => void
  onSuccess: () => void
}

export const WithdrawModal: FC<WithdrawModalProps> = ({
  vault,
  position,
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'yield-only' | 'full'>('yield-only')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [guardrailError, setGuardrailError] = useState<string | null>(null)
  const [txSuccess, setTxSuccess] = useState<{ txHash: string; sharesBurned?: string; assetsReturned?: string } | null>(null)

  if (!position) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="modal-header">
            <h3>No Position in Vault</h3>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>
            The connected account does not currently hold a position in vault <code>{vault.vaultId}</code>.
            Please fund this bond first to acquire shares.
          </p>
        </div>
      </div>
    )
  }

  const pps = vault.pps
  const sharesOwned = Number(position.sharesOwned)
  const principalDeposited = Number(position.principalDeposited)
  const currentValue = sharesOwned * pps
  const accruedYield = Math.max(0, currentValue - principalDeposited)
  const yieldEquivalentShares = accruedYield > 0 ? (accruedYield / pps).toFixed(4) : '0'

  const handleWithdraw = async () => {
    setIsSubmitting(true)
    setGuardrailError(null)
    setTxSuccess(null)

    try {
      const res = await mockChainClient.withdraw({
        depositorAddress: position.accountAddress || position.depositorAddress,
        vaultId: vault.vaultId,
        mode,
      })

      if (res.success) {
        setTxSuccess({
          txHash: res.txHash!,
          sharesBurned: res.sharesBurned,
          assetsReturned: res.assetsReturned,
        })
        onSuccess()
      } else {
        setGuardrailError(res.error || 'Transaction rejected')
      }
    } catch (err: any) {
      setGuardrailError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <h3 className="card-title">Redemption Desk</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{vault.vaultId}</span>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* Financial Position Snapshot */}
        <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
          <div className="metric-row">
            <span className="metric-label">Principal Deposited</span>
            <span className="metric-val">{principalDeposited.toLocaleString()} XRP</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Shares Owned</span>
            <span className="metric-val">{sharesOwned.toLocaleString()} Shares</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Current PPS (Assets / Shares)</span>
            <span className="metric-val highlight-cyan">{pps.toFixed(5)}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Total Value at Current PPS</span>
            <span className="metric-val">{currentValue.toLocaleString()} XRP</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Accrued Yield Available</span>
            <span className="metric-val highlight-green">+{accruedYield.toFixed(2)} XRP</span>
          </div>
        </div>

        {/* Withdrawal Mode Picker */}
        <div className="form-group">
          <label className="form-label">Select Redemption Mechanism</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <button
              type="button"
              className={`btn ${mode === 'yield-only' ? 'btn-success' : 'btn-secondary'}`}
              onClick={() => {
                setMode('yield-only')
                setGuardrailError(null)
              }}
            >
              Yield-Only Partial
            </button>
            <button
              type="button"
              className={`btn ${mode === 'full' ? 'btn-danger' : 'btn-secondary'}`}
              onClick={() => {
                setMode('full')
                setTxSuccess(null)
              }}
            >
              Full Principal (Guardrail Test)
            </button>
          </div>
        </div>

        {mode === 'yield-only' ? (
          <div className="alert alert-info">
            <strong>Partial VaultWithdraw:</strong> Burns only <code>{yieldEquivalentShares}</code> shares corresponding to the <code>+{accruedYield.toFixed(2)} XRP</code> yield accrued via borrower coupons. Leaves principal shares safely intact in the open-ended vault.
          </div>
        ) : (
          <div className="alert alert-warning">
            <strong>Hackathon Minimum Bar Demonstration:</strong> Attempts to withdraw all <code>{sharesOwned}</code> shares (including principal). Because principal is out on loan to the borrower, this deliberately triggers the native XRPL protocol guardrail rejection.
          </div>
        )}

        {txSuccess && (
          <div className="alert alert-success">
            <strong>Withdrawal Successful!</strong>
            <div style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
              Redeemed {txSuccess.sharesBurned} shares for {txSuccess.assetsReturned} XRP.
            </div>
            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              TX Hash: <a href={explorerTxUrl(txSuccess.txHash)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}>{txSuccess.txHash}</a>
            </div>
          </div>
        )}

        {guardrailError && (
          <div className="alert alert-danger" style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
            <strong>[Guardrail Verified]</strong>
            <p style={{ marginTop: '0.4rem' }}>{guardrailError}</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button
            type="button"
            className={mode === 'yield-only' ? 'btn btn-success btn-block' : 'btn btn-danger btn-block'}
            onClick={handleWithdraw}
            disabled={isSubmitting || (mode === 'yield-only' && accruedYield <= 0)}
          >
            {isSubmitting
              ? 'Broadcasting to XRPL...'
              : mode === 'yield-only'
              ? `Redeem Accrued Yield (${accruedYield.toFixed(2)} XRP)`
              : 'Trigger Full Withdrawal Rejection'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
