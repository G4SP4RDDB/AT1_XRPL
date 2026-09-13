import { useState, useEffect } from 'react'
import type { FC, FormEvent } from 'react'
import { chainClient } from '@/lib/chainClient'
import { useWallet } from '@/lib/wallet'
import { notifyTx } from '@/lib/notifications'
import { type BorrowerProfile, saveStoredBorrowerProfile } from '@/lib/borrowerProfile'
import type { AccountRole } from '@shared/types'

export type { BorrowerProfile }

interface BorrowerOnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (profile: BorrowerProfile) => void
  onGoToBrokerHub?: () => void
}

const PRESET_ROLES = [
  'Directeur Financier (CFO)',
  'Trésorier Corporate',
  'Directeur Général (CEO)',
  'Head of Debt Capital Markets',
  'Portfolio Manager (Prêteur)',
  'Head of Fixed Income (Prêteur)',
  'Autre rôle...',
]

export const BorrowerOnboardingModal: FC<BorrowerOnboardingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onGoToBrokerHub,
}) => {
  const { currentAccount, connectAccount } = useWallet()
  const [accountRole, setAccountRole] = useState<AccountRole>('borrower')
  const [isBroker, setIsBroker] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [selectedRole, setSelectedRole] = useState(PRESET_ROLES[0])
  const [customRole, setCustomRole] = useState('')
  const [company, setCompany] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAlreadyMultisig, setIsAlreadyMultisig] = useState(false)
  const [enableMultisig, setEnableMultisig] = useState(true)

  // Load existing profile from SQLite DB and on-chain status
  useEffect(() => {
    if (!isOpen || !currentAccount?.address) return

    chainClient.listAccounts().then((accounts) => {
      const hit = accounts.find((a) => a.address === currentAccount.address)
      setIsBroker(hit?.role === 'broker')
      if (hit) {
        setAccountRole(hit.role || 'unassigned')
        if (hit.firstName) setFirstName(hit.firstName)
        if (hit.company) setCompany(hit.company)
        if (hit.userRole) {
          if (PRESET_ROLES.includes(hit.userRole)) {
            setSelectedRole(hit.userRole)
          } else {
            setSelectedRole('Autre rôle...')
            setCustomRole(hit.userRole)
          }
        }
      }
    })

    // Check on-chain masterDisabled status
    chainClient.isMasterDisabled(currentAccount.address).then((disabled) => {
      setIsAlreadyMultisig(disabled)
    })
  }, [isOpen, currentAccount?.address])

  if (!isOpen) return null

  const effectiveRole = selectedRole === 'Autre rôle...' ? (customRole.trim() || (accountRole === 'borrower' ? 'Emprunteur' : accountRole === 'broker' ? 'Courtier' : 'Investisseur')) : selectedRole

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentAccount?.address) return

    setIsSubmitting(true)

    try {
      // 1. Update/insert in SQLite database
      const updated = await chainClient.updateAccount({
        address: currentAccount.address,
        role: accountRole,
        firstName: firstName.trim() || undefined,
        userRole: effectiveRole,
        company: company.trim() || undefined,
        name: firstName.trim()
          ? `${firstName.trim()} (${company.trim() || (accountRole === 'borrower' ? 'Emprunteur' : accountRole === 'broker' ? 'Courtier Plateforme' : accountRole === 'lender' ? 'Prêteur' : 'Compte')})`
          : accountRole === 'borrower' ? 'Emprunteur' : accountRole === 'broker' ? 'Courtier Plateforme' : accountRole === 'lender' ? 'Prêteur' : 'Compte Aléatoire',
      })

      // 2. If borrower or lender and requested multisig, trigger multisig configuration
      let txHash: string | undefined
      if ((accountRole === 'borrower' || accountRole === 'lender') && enableMultisig && !isAlreadyMultisig) {
        try {
          const res = await chainClient.setupMultisig(currentAccount.address)
          if (res.success) txHash = res.txHash
        } catch (mErr) {
          console.warn('Multisig activation deferred or failed:', mErr)
        }
      }

      const profile: BorrowerProfile = {
        firstName: firstName.trim() || (accountRole === 'borrower' ? 'Emprunteur' : accountRole === 'broker' ? 'Courtier' : 'Investisseur'),
        role: effectiveRole,
        company: company.trim() || (accountRole === 'borrower' ? 'Corporate Issuer' : accountRole === 'broker' ? 'BSA Structurer' : 'Asset Management'),
        address: currentAccount.address,
        onboardingCompleted: true,
        multisigActive: isAlreadyMultisig || ((accountRole === 'borrower' || accountRole === 'lender') && enableMultisig),
        configuredAt: new Date().toISOString(),
        txHash,
      }

      saveStoredBorrowerProfile(profile)
      onSuccess?.(profile)

      // Update connected wallet in context
      connectAccount({
        address: currentAccount.address,
        name: updated.name,
        role: accountRole,
      })

      notifyTx({
        title: 'Compte configuré & enregistré en base !',
        message: `Rôle ${accountRole === 'borrower' ? 'Emprunteur' : accountRole === 'broker' ? 'Courtier' : accountRole === 'lender' ? 'Prêteur' : 'Libre'} enregistré dans la base SQLite locale.`,
        txHash: txHash || undefined,
        type: 'success',
      })

      if (onSuccess) onSuccess(profile)
      onClose()
    } catch (err: any) {
      notifyTx({
        title: 'Échec de la configuration',
        message: err.message,
        type: 'error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{
          maxWidth: '560px',
          padding: '2rem',
          borderRadius: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h3 className="card-title" style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{isBroker ? '🏛️' : '⚙️'}</span>
              <span>{isBroker ? 'Espace Administration — Courtier Plateforme' : 'Gestion Personnelle du Rôle & Profil'}</span>
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {isBroker
                ? 'Ce compte est le Courtier fixe de la plateforme — son rôle ne peut pas être modifié.'
                : 'Vous devez choisir le rôle (Emprunteur ou Prêteur) de ce compte'}
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {isBroker ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                background: 'rgba(147, 51, 234, 0.08)',
                border: '1px solid rgba(147, 51, 234, 0.25)',
                borderRadius: '10px',
                padding: '0.9rem 1rem',
                fontSize: '0.85rem',
                lineHeight: 1.5,
              }}
            >
              En tant que Courtier, vous structurez les prêts, déposez le First-Loss Capital et pilotez la
              solvabilité (CET1) des émetteurs depuis le <strong>Broker Hub</strong>. Les nouveaux comptes
              emprunteur/prêteur sont désormais des wallets indépendants : lancez{' '}
              <code>npm run create-accounts</code> pour en financer, à importer dans un vrai wallet.
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem' }}
              onClick={() => {
                onGoToBrokerHub?.()
                onClose()
              }}
            >
              <span>🩺</span>
              <span>Piloter le Health Factor (CET1) — Broker Hub</span>
            </button>

            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Fermer
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Sélection du Rôle */}
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

          {/* Prénom */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
              Prénom / Identifiant
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="ex: Alexandre, Marc, Sophie, ou libre..."
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Rôle métier */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
              Titre / Rôle métier
            </label>
            <select
              className="form-input"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              {PRESET_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {selectedRole === 'Autre rôle...' && (
              <input
                type="text"
                className="form-input"
                placeholder="Précisez votre titre exact..."
                style={{ marginTop: '0.5rem' }}
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
              />
            )}
          </div>

          {/* Société */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
              Société ou Entité
            </label>
            <input
              type="text"
              className="form-input"
              placeholder={accountRole === 'borrower' ? 'ex: AT1 Corporate Issuer' : 'ex: Fixed Income Fund'}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>

          {/* Encadré d'explication Multisig si Emprunteur ou Prêteur */}
          {(accountRole === 'borrower' || accountRole === 'lender') && (
            <div
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderLeft: `4px solid ${accountRole === 'borrower' ? 'var(--accent-blue)' : 'var(--accent-green)'}`,
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                fontSize: '0.8rem',
                lineHeight: 1.45,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <div style={{ fontWeight: 700, color: accountRole === 'borrower' ? 'var(--accent-blue)' : 'var(--accent-green)' }}>
                  🛡️ Gouvernance Multisig 2-sur-2 ({accountRole === 'borrower' ? 'Emprunteur' : 'Prêteur'})
                </div>
                {!isAlreadyMultisig && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.78rem' }}>
                    <input
                      type="checkbox"
                      checked={enableMultisig}
                      onChange={(e) => setEnableMultisig(e.target.checked)}
                    />
                    <span>Activer 2/2</span>
                  </label>
                )}
              </div>
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                {accountRole === 'borrower'
                  ? "Pour un emprunteur, la règle SignerListSet (Quorum 2) avec l'Enforcer logiciel et la désactivation de clé maître (asfDisableMaster) garantit le respect strict de la Call Date."
                  : "Pour un prêteur, le Multisig 2-sur-2 garantit que vous seul récupérez vos parts. L'Enforcer co-signe librement vos retraits de coupons à tout moment et sanctuarise votre principal jusqu'à clôture/remboursement du prêt."}
              </p>
              {isAlreadyMultisig && (
                <div style={{ marginTop: '0.4rem', color: 'var(--accent-green)', fontWeight: 600 }}>
                  ✓ Le Multisig 2-sur-2 est déjà activé on-chain sur cette adresse.
                </div>
              )}
            </div>
          )}

          {/* Bouton de validation */}
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ flex: 1 }}
              disabled={isSubmitting}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span>⏳</span>
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>Enregistrer les Modifications</span>
                </>
              )}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}
