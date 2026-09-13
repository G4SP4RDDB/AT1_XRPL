import { useState } from 'react'
import type { FC } from 'react'
import type { Ask } from '@shared/types'
import { useWallet } from '@/lib/wallet'
import { chainClient } from '@/lib/chainClient'
import { explorerTxUrl } from '@/lib/xrpl'

interface FundBondModalProps {
  ask: Ask
  bankName: string
  remainingLiquidity: number
  onClose: () => void
  onSuccess: () => void
}

/** Direct funding: a real VaultDeposit into the bond's vault, signed by the connected lender's
 *  own wallet. The backend originates the loan itself as soon as the vault is fully funded. */
export const FundBondModal: FC<FundBondModalProps> = ({ ask, bankName, remainingLiquidity, onClose, onSuccess }) => {
  const { currentAccount } = useWallet()
  const [amount, setAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txSuccess, setTxSuccess] = useState<{ txHash: string } | null>(null)

  const handleFund = async () => {
    if (!currentAccount?.address || !amount) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await chainClient.fundBond(ask.id, currentAccount.address, amount)
      setTxSuccess({ txHash: res.txHash })
      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Deposit failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="card-title">Fund This Bond</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{bankName}</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
          <div className="metric-row">
            <span className="metric-label">Coupon Rate</span>
            <span className="metric-val highlight-green">{ask.yieldRate}%</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Call Date</span>
            <span className="metric-val">{new Date(ask.callDate).toLocaleDateString()}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Remaining Capacity</span>
            <span className="metric-val">{remainingLiquidity.toLocaleString()} XRP</span>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Amount to Deposit (XRP)</label>
          <input
            type="number"
            className="form-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="1"
            max={remainingLiquidity || undefined}
            placeholder={`Up to ${remainingLiquidity.toLocaleString()}`}
            disabled={isSubmitting || remainingLiquidity <= 0}
          />
        </div>

        {txSuccess && (
          <div className="alert alert-success">
            <strong>Deposit successful!</strong>
            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              TX Hash: <a href={explorerTxUrl(txSuccess.txHash)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}>{txSuccess.txHash}</a>
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-danger" style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleFund}
            disabled={isSubmitting || !amount || remainingLiquidity <= 0}
          >
            {isSubmitting ? 'Broadcasting to XRPL...' : remainingLiquidity <= 0 ? 'Fully Subscribed' : `Deposit ${amount || '...'} XRP`}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
