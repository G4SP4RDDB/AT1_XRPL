import { useState } from 'react'
import type { FC, FormEvent } from 'react'
import { useWallet } from '@/lib/wallet'
import { chainClient } from '@/lib/chainClient'
import { notifyTx } from '@/lib/notifications'
import { useBorrowerProfile } from '@/lib/borrowerProfile'

interface IssueBondProps {
  onSuccess: () => void
  onOpenProfile?: () => void
}

export const IssueBond: FC<IssueBondProps> = ({ onSuccess, onOpenProfile }) => {
  const { currentAccount } = useWallet()
  const borrowerProfile = useBorrowerProfile(currentAccount?.address)
  const [amount, setAmount] = useState('')
  const [yieldRate, setYieldRate] = useState('')
  const [callDate, setCallDate] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentAccount) return
    setIsSubmitting(true)
    setSuccessMsg(null)

    const issuerName = borrowerProfile
      ? `${borrowerProfile.firstName} (${borrowerProfile.role})`
      : (currentAccount.name || 'AT1 Corporate Issuer')

    try {
      await chainClient.createBid({
        borrowerAddress: currentAccount.address,
        borrowerName: issuerName,
        amount,
        yieldRate: parseFloat(yieldRate),
        callDate,
        description,
      })
      setSuccessMsg(`The ${Number(amount).toLocaleString()} XRP bond issuance has been created successfully! It is now open for funding.`)
      onSuccess()
    } catch (err: any) {
      notifyTx({
        title: "Erreur d'émission",
        message: err.message,
        type: 'error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Issue AT1 Bond</h3>
            <p className="section-subtitle">
              Create a bond issuance and provision an isolated Single Asset Vault on XRPL
            </p>
          </div>
        </div>

        {successMsg && (
          <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>
            {successMsg}
          </div>
        )}

        <div
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '0.85rem 1.1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
              {borrowerProfile ? `👤 Émetteur : ${borrowerProfile.firstName} (${borrowerProfile.role})` : '⚠️ Profil Emprunteur non renseigné'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              {borrowerProfile
                ? `Multisig 2-sur-2 : ${borrowerProfile.multisigActive ? '✅ Actif on-chain' : 'En attente'}`
                : 'Précisez votre prénom et rôle d\'émetteur pour initialiser la gouvernance.'}
            </div>
          </div>
          {onOpenProfile && (
            <button
              type="button"
              className={`btn btn-sm ${borrowerProfile ? 'btn-secondary' : 'btn-primary'}`}
              onClick={onOpenProfile}
              style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}
            >
              {borrowerProfile ? 'Modifier le Profil' : 'Renseigner mon Profil'}
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Connected Issuer Account</label>
            <input
              type="text"
              className="form-input"
              value={currentAccount?.address || ''}
              disabled
              style={{ opacity: 0.8, fontFamily: 'monospace' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Principal Amount to Raise (XRP)</label>
            <input
              type="number"
              className="form-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              min="1000"
              step="1000"
              placeholder="e.g. 500000"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Offered Coupon Rate (% APY)</label>
              <input
                type="number"
                className="form-input"
                value={yieldRate}
                onChange={(e) => setYieldRate(e.target.value)}
                required
                min="0.5"
                max="50"
                step="0.1"
                placeholder="e.g. 8.5"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Call Date / Maturity</label>
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
            <label className="form-label">Issuance Description / Note Terms</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Financing purpose, subordination covenants..."
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isSubmitting}
            style={{ marginTop: '0.5rem', padding: '0.85rem' }}
          >
            {isSubmitting ? 'Publishing Issuance...' : 'Issue Bond'}
          </button>
        </form>
      </div>
    </div>
  )
}
