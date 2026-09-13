import { useState, useEffect } from 'react'
import type { FC, FormEvent } from 'react'
import { chainClient } from '@/lib/chainClient'
import { useWallet } from '@/lib/wallet'
import { notifyTx } from '@/lib/notifications'
import { type BorrowerProfile, getStoredBorrowerProfile, saveStoredBorrowerProfile } from '@/lib/borrowerProfile'
import { invalidateProfile } from '@/lib/bankProfiles'
import type { AccountRole } from '@shared/types'

export type { BorrowerProfile }

interface BorrowerOnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (profile: BorrowerProfile) => void
  onGoToBrokerHub?: () => void
}

const roleLabel = (r: AccountRole) => (r === 'borrower' ? 'Emprunteur' : r === 'lender' ? 'Prêteur' : r === 'broker' ? 'Courtier Plateforme' : 'Compte')
const defaultCompany = (r: AccountRole) => (r === 'borrower' ? 'Corporate Issuer' : r === 'broker' ? 'BSA Structurer' : 'Asset Management')

/** Role and institution of the connected account. Two questions, nothing else: the display
 *  identity is the institution, and the 2-of-2 multisig governance is activated where it is
 *  needed (Issue tab for an issuer, withdraw modal for an investor), not here. */
export const BorrowerOnboardingModal: FC<BorrowerOnboardingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onGoToBrokerHub,
}) => {
  const { currentAccount, connectAccount } = useWallet()
  const [accountRole, setAccountRole] = useState<AccountRole>('borrower')
  const [isBroker, setIsBroker] = useState(false)
  const [company, setCompany] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // null while loading; false = this address is not in the registry yet (first connection).
  const [existsInDb, setExistsInDb] = useState<boolean | null>(null)
  const isFirstConnection = existsInDb !== true

  useEffect(() => {
    if (!isOpen || !currentAccount?.address) return
    chainClient.listAccounts().then((accounts) => {
      const hit = accounts.find((a) => a.address === currentAccount.address)
      setIsBroker(hit?.role === 'broker')
      setExistsInDb(!!hit)
      if (hit) {
        setAccountRole(hit.role || 'unassigned')
        if (hit.company) setCompany(hit.company)
      }
    })
  }, [isOpen, currentAccount?.address])

  if (!isOpen) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentAccount?.address) return
    setIsSubmitting(true)
    try {
      const companyName = company.trim() || defaultCompany(accountRole)
      const updated = await chainClient.updateAccount({
        address: currentAccount.address,
        role: accountRole,
        company: companyName,
        name: `${roleLabel(accountRole)} (${companyName})`,
      })

      const previous = getStoredBorrowerProfile(currentAccount.address)
      const profile: BorrowerProfile = {
        firstName: roleLabel(accountRole),
        role: roleLabel(accountRole),
        company: companyName,
        address: currentAccount.address,
        onboardingCompleted: true,
        multisigActive: previous?.multisigActive ?? false,
        configuredAt: new Date().toISOString(),
        txHash: previous?.txHash,
      }
      saveStoredBorrowerProfile(profile)
      invalidateProfile(currentAccount.address)

      connectAccount({ address: currentAccount.address, name: updated.name, role: accountRole })

      notifyTx({
        title: isFirstConnection ? 'Compte enregistré' : 'Profil mis à jour',
        message: `Rôle ${roleLabel(accountRole)} · ${companyName}`,
        type: 'success',
      })
      onSuccess?.(profile)
      onClose()
    } catch (err: any) {
      notifyTx({ title: 'Échec de la configuration', message: err.message, type: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '520px', padding: '2rem', borderRadius: '16px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h3 className="card-title" style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{isBroker ? '🏛️' : '⚙️'}</span>
              <span>{isBroker ? 'Espace Administration — Courtier Plateforme' : isFirstConnection ? 'Bienvenue — choisissez votre rôle' : 'Gestion Personnelle du Rôle & Profil'}</span>
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {isBroker
                ? 'Ce compte est le Courtier fixe de la plateforme — son rôle ne peut pas être modifié.'
                : isFirstConnection
                  ? 'Une seule question pour commencer : ce compte est-il un émetteur ou un investisseur ?'
                  : "Modifiez le rôle et l'institution affichée pour ce compte"}
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {isBroker ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'rgba(147, 51, 234, 0.08)', border: '1px solid rgba(147, 51, 234, 0.25)', borderRadius: '10px', padding: '0.9rem 1rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
              En tant que Courtier, vous structurez les prêts, déposez le First-Loss Capital et pilotez la
              solvabilité (CET1) des émetteurs depuis le <strong>Broker Hub</strong>. Les comptes emprunteur/prêteur
              sont des wallets indépendants : lancez <code>npm run create-accounts</code> pour en financer.
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem' }}
              onClick={() => { onGoToBrokerHub?.(); onClose() }}
            >
              <span>🩺</span>
              <span>Piloter le Health Factor (CET1) — Broker Hub</span>
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: '0.25rem' }}>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                Rôle attribué à ce compte <span style={{ color: 'var(--accent-red)' }}>*</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${accountRole === 'borrower' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setAccountRole('borrower')}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.5rem 0.3rem', gap: '0.2rem' }}
                >
                  <span style={{ fontSize: '1.1rem' }}>🏢</span>
                  <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Emprunteur</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${accountRole === 'lender' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setAccountRole('lender')}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.5rem 0.3rem', gap: '0.2rem' }}
                >
                  <span style={{ fontSize: '1.1rem' }}>💰</span>
                  <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Prêteur</span>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Société ou Entité</label>
              <input
                type="text"
                className="form-input"
                placeholder={accountRole === 'borrower' ? 'ex: AT1 Corporate Issuer' : 'ex: Fixed Income Fund'}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>

            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }} disabled={isSubmitting}>
                Annuler
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                disabled={isSubmitting}
              >
                {isSubmitting ? <><span>⏳</span><span>Enregistrement...</span></> : <><span>✓</span><span>{isFirstConnection ? 'Continuer' : 'Enregistrer'}</span></>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
