import { useState, useEffect } from 'react'
import type { FC, FormEvent } from 'react'
import { useWallet } from '@/lib/wallet'
import { canIssue } from '@/lib/roles'
import { chainClient } from '@/lib/chainClient'
import { DURATION_OPTIONS, expiresAtFromNow } from '@/lib/durations'
import { notifyTx } from '@/lib/notifications'
import { useBorrowerProfile, getStoredBorrowerProfile, saveStoredBorrowerProfile } from '@/lib/borrowerProfile'

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
  const [durationMs, setDurationMs] = useState<number>(DURATION_OPTIONS[3].ms)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  // On-chain truth for the 2-of-2 governance (master key disabled), null while loading.
  const [multisigActive, setMultisigActive] = useState<boolean | null>(null)
  const [isActivatingMultisig, setIsActivatingMultisig] = useState(false)

  useEffect(() => {
    const address = currentAccount?.address
    if (!address) return
    let cancelled = false
    setMultisigActive(null)
    chainClient.isMasterDisabled(address).then((d) => { if (!cancelled) setMultisigActive(d) }).catch(() => { if (!cancelled) setMultisigActive(false) })
    return () => { cancelled = true }
  }, [currentAccount?.address])

  const handleActivateMultisig = async () => {
    if (!currentAccount?.address) return
    setIsActivatingMultisig(true)
    try {
      const res = await chainClient.setupMultisig(currentAccount.address)
      if (res.success) {
        setMultisigActive(true)
        const stored = getStoredBorrowerProfile(currentAccount.address)
        if (stored) saveStoredBorrowerProfile({ ...stored, multisigActive: true, txHash: res.txHash ?? stored.txHash })
      } else if (res.error) {
        notifyTx({ title: 'Activation du multisig refusée', message: res.error, type: 'error' })
      }
    } catch (err: any) {
      notifyTx({ title: "Échec de l'activation du multisig", message: err?.message ?? String(err), type: 'error' })
    } finally {
      setIsActivatingMultisig(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentAccount || !canIssue(currentAccount.role)) return
    setIsSubmitting(true)
    setSuccessMsg(null)

    const issuerName = borrowerProfile?.company || currentAccount.name || 'AT1 Corporate Issuer'

    try {
      await chainClient.createAsk({
        borrowerAddress: currentAccount.address,
        borrowerName: issuerName,
        amount,
        yieldRate: parseFloat(yieldRate),
        callDate,
        description,
        expiresAt: expiresAtFromNow(durationMs),
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

        {/* Issuer status: institution + 2-of-2 governance. The multisig is activated here (the
            issuer's own wallet signs SignerListSet + AccountSet) because origination and every
            coupon need the enforcer's co-signature on this account. */}
        <div
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderLeft: `4px solid ${multisigActive ? 'var(--accent-green)' : 'var(--accent-blue)'}`,
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
              {borrowerProfile ? `🏢 Émetteur : ${borrowerProfile.company}` : '⚠️ Profil émetteur non renseigné'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              {multisigActive === null
                ? 'Gouvernance 2-sur-2 : vérification on-chain…'
                : multisigActive
                  ? '🛡️ Gouvernance 2-sur-2 active on-chain (SignerListSet + clé maître désactivée)'
                  : "Gouvernance 2-sur-2 : à activer avant d'originer — l'Enforcer doit co-signer vos remboursements."}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            {multisigActive === false && canIssue(currentAccount?.role) && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={isActivatingMultisig}
                onClick={handleActivateMultisig}
                style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}
              >
                {isActivatingMultisig ? 'Signature…' : '🛡️ Activer 2/2'}
              </button>
            )}
            {onOpenProfile && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenProfile} style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                {borrowerProfile ? 'Modifier le Profil' : 'Renseigner mon Profil'}
              </button>
            )}
          </div>
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
              <label className="form-label">Call Date</label>
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
            <label className="form-label">Bidding Window</label>
            <select
              className="form-select"
              value={durationMs}
              onChange={(e) => setDurationMs(Number(e.target.value))}
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.ms}>
                  Open for {opt.label}
                </option>
              ))}
            </select>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              No new bids accepted after this window closes. Off-chain only, not enforced by the ledger.
            </p>
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

          {!canIssue(currentAccount?.role) && (
            <div className="alert alert-warning" style={{ fontSize: '0.82rem', marginTop: '0.5rem' }}>
              Only issuer (borrower) accounts can post a bond. This account is registered as
              {currentAccount?.role === 'lender' ? ' an investor' : currentAccount?.role === 'broker' ? ' the platform broker' : ' not onboarded yet'}.
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isSubmitting || !canIssue(currentAccount?.role)}
            style={{ marginTop: '0.5rem', padding: '0.85rem' }}
          >
            {isSubmitting ? 'Publishing Issuance...' : 'Issue Bond'}
          </button>
        </form>
      </div>
    </div>
  )
}
