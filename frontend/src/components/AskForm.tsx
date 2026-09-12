import { useState } from 'react'
import type { FC, FormEvent } from 'react'
import { useWallet } from '@/lib/wallet'
import { chainClient } from '@/lib/chainClient'
import { useBankName, getCachedProfile } from '@/lib/bankProfiles'
import type { Bid } from '@shared/types'

interface AskFormProps {
  bids: Bid[]
  onAskCreated: () => void
}

export const AskForm: FC<AskFormProps> = ({ bids, onAskCreated }) => {
  const { currentAccount } = useWallet()
  const lenderName = useBankName(currentAccount?.address, currentAccount?.name)
  const [amount, setAmount] = useState('')
  const [targetYield, setTargetYield] = useState('')
  const [selectedBidId, setSelectedBidId] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentAccount) return
    setIsSubmitting(true)
    setFeedback(null)

    try {
      await chainClient.createAsk({
        lenderAddress: currentAccount.address,
        lenderName,
        amount,
        targetYield: parseFloat(targetYield),
        bidId: selectedBidId || undefined,
      })

      setFeedback('Indicative Ask submitted! Matching desk has queued interest against matching AT1 bond bids.')
      onAskCreated()
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
          <h3 className="card-title">Lender: Post Indicative Ask</h3>
          <p className="section-subtitle">Express institutional liquidity interest without on-chain order book gas</p>
        </div>
        <span className="card-tag tag-matched">Investor Desk</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Available Capital (XRP)</label>
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

        <div className="form-group">
          <label className="form-label">Minimum Target Yield (%)</label>
          <input
            type="number"
            className="form-input"
            value={targetYield}
            onChange={(e) => setTargetYield(e.target.value)}
            required
            min="1"
            max="50"
            step="0.05"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Target Specific Bond Bid (Optional)</label>
          <select
            className="form-select"
            value={selectedBidId}
            onChange={(e) => setSelectedBidId(e.target.value)}
          >
            <option value="">-- General Allocation Pool (Auto-match) --</option>
            {bids
              .filter((b) => b.status === 'open')
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {getCachedProfile(b.borrowerAddress)?.bankName || b.borrowerName || b.id} ({Number(b.amount).toLocaleString()} XRP @ {b.yieldRate}% | Call: {b.callDate})
                </option>
              ))}
          </select>
        </div>

        <div className="alert alert-info">
          <strong>Off-chain Discovery:</strong> Asks remain off-ledger in the matching engine. On-chain transaction (<code>VaultDeposit</code>) is triggered only upon counterparty alignment.
        </div>

        {feedback && (
          <div className="alert alert-success">
            {feedback}
          </div>
        )}

        <button type="submit" className="btn btn-secondary btn-block" disabled={isSubmitting}>
          {isSubmitting ? 'Posting Interest...' : 'Post Indicative Ask'}
        </button>
      </form>
    </div>
  )
}
