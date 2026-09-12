import { useState } from 'react'
import type { FC, FormEvent } from 'react'
import { useWallet } from '@/lib/wallet'
import { chainClient } from '@/lib/chainClient'
import { useBankName } from '@/lib/bankProfiles'

interface BidFormProps {
  onBidCreated: () => void
}

export const BidForm: FC<BidFormProps> = ({ onBidCreated }) => {
  const { currentAccount } = useWallet()
  const borrowerName = useBankName(currentAccount?.address, currentAccount?.name)
  const [amount, setAmount] = useState('')
  const [yieldRate, setYieldRate] = useState('')
  const [callDate, setCallDate] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentAccount) return
    setIsSubmitting(true)
    setFeedback(null)

    try {
      await chainClient.createBid({
        borrowerAddress: currentAccount.address,
        borrowerName,
        amount,
        yieldRate: parseFloat(yieldRate),
        callDate,
        description,
      })

      setFeedback(`Bid successfully published! Automatically prepared VaultCreate + LoanBrokerSet template on XRPL.`)
      onBidCreated()
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title">Borrower: Emit AT1 Bond Bid</h3>
          <p className="section-subtitle">Specifies funding size, coupon yield offered, and principal call date</p>
        </div>
        <span className="card-tag tag-open">Issuing Desk</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Principal Amount Requested (XRP)</label>
          <input
            type="number"
            className="form-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            min="1000"
            step="1000"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Annualized Coupon Yield (%)</label>
            <input
              type="number"
              className="form-input"
              value={yieldRate}
              onChange={(e) => setYieldRate(e.target.value)}
              required
              min="1"
              max="50"
              step="0.05"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Agreed Call Date (Principal Lock)</label>
            <input
              type="date"
              className="form-input"
              value={callDate}
              onChange={(e) => setCallDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Issuance Rationale / Note Description</label>
          <textarea
            className="form-textarea"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="alert alert-info">
          <strong>Protocol Workflow:</strong> Submitting this bid provisions an isolated <em>Single Asset Vault (XLS-65)</em>. Principal is illiquid while on loan and gated by broker multisig co-signature until the call date.
        </div>

        {feedback && (
          <div className="alert alert-success">
            {feedback}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
          {isSubmitting ? 'Publishing On-Ledger...' : 'Emit Bid & Prepare Vault'}
        </button>
      </form>
    </div>
  )
}
