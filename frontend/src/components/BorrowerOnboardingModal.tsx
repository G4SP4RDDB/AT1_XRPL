import { useState, useEffect } from 'react'
import type { FC, FormEvent } from 'react'
import { chainClient } from '@/lib/chainClient'
import { useWallet } from '@/lib/wallet'
import { notifyTx } from '@/lib/notifications'
import { type BorrowerProfile, saveStoredBorrowerProfile } from '@/lib/borrowerProfile'

export type { BorrowerProfile }

interface BorrowerOnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (profile: BorrowerProfile) => void
}

const PRESET_ROLES = [
  'Directeur Financier (CFO)',
  'Trésorier Corporate',
  'Directeur Général (CEO)',
  'Head of Debt Capital Markets',
  'Autre rôle...',
]

export const BorrowerOnboardingModal: FC<BorrowerOnboardingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { currentAccount } = useWallet()
  const [firstName, setFirstName] = useState('')
  const [selectedRole, setSelectedRole] = useState(PRESET_ROLES[0])
  const [customRole, setCustomRole] = useState('')
  const [company, setCompany] = useState('AT1 Corporate Issuer')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAlreadyMultisig, setIsAlreadyMultisig] = useState(false)

  // Load existing profile or on-chain status
  useEffect(() => {
    if (!isOpen || !currentAccount?.address) return

    const saved = localStorage.getItem(`at1_borrower_profile_${currentAccount.address}`)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as BorrowerProfile
        setFirstName(parsed.firstName || '')
        if (PRESET_ROLES.includes(parsed.role)) {
          setSelectedRole(parsed.role)
        } else {
          setSelectedRole('Autre rôle...')
          setCustomRole(parsed.role || '')
        }
        setCompany(parsed.company || 'AT1 Corporate Issuer')
      } catch {
        // ignore
      }
    }

    // Check on-chain masterDisabled status
    chainClient.isMasterDisabled(currentAccount.address).then((disabled) => {
      setIsAlreadyMultisig(disabled)
    })
  }, [isOpen, currentAccount?.address])

  if (!isOpen) return null

  const effectiveRole = selectedRole === 'Autre rôle...' ? (customRole.trim() || 'Emprunteur') : selectedRole

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentAccount?.address) return
    if (!firstName.trim()) {
      notifyTx({
        title: 'Prénom requis',
        message: 'Veuillez saisir votre prénom pour enregistrer votre profil.',
        type: 'error',
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Execute on-chain multisig configuration
      const res = await chainClient.setupBorrowerMultisig(currentAccount.address)
      if (!res.success && res.error) {
        throw new Error(res.error)
      }

      const profile: BorrowerProfile = {
        firstName: firstName.trim(),
        role: effectiveRole,
        company: company.trim(),
        address: currentAccount.address,
        multisigActive: true,
        configuredAt: new Date().toISOString(),
      }

      saveStoredBorrowerProfile(profile)

      notifyTx({
        title: 'Profil Emprunteur & Multisig Configuré',
        message: `Bienvenue ${profile.firstName} (${profile.role}) chez ${profile.company}. Sécurité 2-sur-2 active !`,
        txHash: res.txHash || undefined,
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
              <span>🏢</span>
              <span>Profil Emprunteur & Sécurité Multisig</span>
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Configuration personnalisée de l'émetteur obligataire AT1
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Prénom */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
              Prénom du Représentant <span style={{ color: 'var(--accent-red)' }}>*</span>
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="ex: Alexandre, Marc, Sophie..."
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoFocus
            />
          </div>

          {/* Rôle */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
              Rôle / Titre dans l'entreprise <span style={{ color: 'var(--accent-red)' }}>*</span>
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
                required
              />
            )}
          </div>

          {/* Société */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
              Société ou Entité Émettrice
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="ex: AT1 Corporate Issuer, Tech FinCorp..."
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>

          {/* Encadré d'explication Multisig */}
          <div
            style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderLeft: '4px solid var(--accent-blue)',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              fontSize: '0.8rem',
              lineHeight: 1.45,
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--accent-blue)', marginBottom: '0.25rem' }}>
              🛡️ Gouvernance Multisig 2-sur-2 (XLS-65 / XLS-66)
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              En soumettant ce formulaire, votre compte emprunteur configure la règle{' '}
              <code>SignerListSet</code> (Quorum 2) avec le <strong>Call-Date Enforcer</strong> et désactive sa clé maître (<code>asfDisableMaster</code>). Le remboursement anticipé unilatéral sera ainsi strictement bloqué avant la date convenue.
            </p>
            {isAlreadyMultisig && (
              <div style={{ marginTop: '0.4rem', color: 'var(--accent-green)', fontWeight: 600 }}>
                ✓ Le Multisig 2-sur-2 est déjà activé on-chain sur cette adresse.
              </div>
            )}
          </div>

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
                  <span>Activation on-chain...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>Enregistrer & Activer le Multisig</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
