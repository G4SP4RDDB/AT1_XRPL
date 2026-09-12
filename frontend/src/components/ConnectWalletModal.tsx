import { useState, useEffect } from 'react'
import type { FC } from 'react'
import { useWallet } from '@/lib/wallet'
import { walletManager } from '@/lib/xrplConnect'
import { chainClient } from '@/lib/chainClient'
import { notifyTx } from '@/lib/notifications'
import type { DbAccount } from '@shared/types'

interface ConnectWalletModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ConnectWalletModal: FC<ConnectWalletModalProps> = ({ isOpen, onClose }) => {
  const { connectWalletConnect, connectAccount, isConnected } = useWallet()
  const [activeTab, setActiveTab] = useState<'db' | 'create' | 'wc'>('db')
  
  // Stored accounts state
  const [dbAccounts, setDbAccounts] = useState<DbAccount[]>([])
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)

  // Account creation state
  const [newRole, setNewRole] = useState<'borrower' | 'lender'>('borrower')
  const [newFirstName, setNewFirstName] = useState('')
  const [newUserRole, setNewUserRole] = useState('Directeur Financier (CFO)')
  const [newCompany, setNewCompany] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // WalletConnect state
  const [pairingUri, setPairingUri] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isInitializingWc, setIsInitializingWc] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const loadAccountsFromDb = async () => {
    setIsLoadingAccounts(true)
    try {
      const accounts = await chainClient.listAccounts()
      setDbAccounts(accounts || [])
    } catch (err) {
      console.warn('Could not load accounts from DB:', err)
    } finally {
      setIsLoadingAccounts(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadAccountsFromDb()
    }
  }, [isOpen])

  const startWcSession = async () => {
    setIsInitializingWc(true)
    setErrorMsg(null)
    setPairingUri(null)

    const el = document.getElementById('xrpl-wallet-connector-ui') as any
    if (el) {
      if (typeof el.setWalletManager === 'function') el.setWalletManager(walletManager)
      if (typeof el.open === 'function') el.open()
    }

    try {
      await connectWalletConnect((uri: string) => {
        setPairingUri(uri)
        setIsInitializingWc(false)
      })
    } catch (err: any) {
      setErrorMsg(err?.message || 'Connection failed')
      setIsInitializingWc(false)
    }
  }

  useEffect(() => {
    if (isOpen && activeTab === 'wc' && !isConnected && !pairingUri && !isInitializingWc) {
      startWcSession()
    }
  }, [isOpen, activeTab, isConnected])

  useEffect(() => {
    if (isConnected && isOpen) {
      onClose()
    }
  }, [isConnected, isOpen, onClose])

  const handleCopy = async () => {
    if (!pairingUri) return
    try {
      await navigator.clipboard.writeText(pairingUri)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // ignore
    }
  }

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    try {
      const created = await chainClient.createAccount({
        role: newRole,
        name: newRole === 'borrower' ? `${newFirstName || 'Emprunteur'} (${newCompany || 'Société'})` : `${newFirstName || 'Investisseur'} (${newCompany || 'Fonds'})`,
        company: newCompany.trim() || undefined,
        firstName: newFirstName.trim() || undefined,
        userRole: newRole === 'borrower' ? newUserRole : 'Gestionnaire de Portefeuille',
      })

      notifyTx({
        title: `Compte ${newRole === 'borrower' ? 'Emprunteur' : 'Prêteur'} créé !`,
        message: `Adresse ${created.address.slice(0, 8)}... financée avec 1 000 XRP via le faucet Devnet.`,
        type: 'success',
      })

      await loadAccountsFromDb()
      connectAccount({
        address: created.address,
        name: created.name,
      })
      onClose()
    } catch (err: any) {
      notifyTx({
        title: 'Échec de la création',
        message: err.message,
        type: 'error',
      })
    } finally {
      setIsCreating(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{
          maxWidth: '580px',
          padding: '2rem',
          borderRadius: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h3 className="card-title" style={{ fontSize: '1.25rem', margin: 0 }}>
              Sélection & Connexion de Compte
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              XRPL Custom Devnet · Les clés utilisateurs sont stockées en DB, seul le Broker est pré-défini
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Navigation Onglets */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'db' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('db')}
            style={{ borderRadius: '8px' }}
          >
            👥 Comptes en Base ({dbAccounts.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'create' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('create')}
            style={{ borderRadius: '8px' }}
          >
            ⚡ Nouveau Compte Devnet
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'wc' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('wc')}
            style={{ borderRadius: '8px' }}
          >
            📱 WalletConnect
          </button>
        </div>

        {/* CONTENU ONGLET 1: COMPTES DB */}
        {activeTab === 'db' && (
          <div>
            {isLoadingAccounts ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                <span>⏳ Chargement des comptes depuis la base SQLite...</span>
              </div>
            ) : dbAccounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--bg-surface-elevated)', borderRadius: '12px', border: '1px dashed var(--border-subtle)' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📭</div>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Aucun compte enregistré pour le moment</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Créez un nouvel emprunteur ou prêteur financé à 1 000 XRP en 1 clic.
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setActiveTab('create')}>
                  ⚡ Créer mon premier compte
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px' }}>
                {dbAccounts.map((acc) => {
                  const isBorrower = acc.role === 'borrower'
                  return (
                    <div
                      key={acc.address}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.85rem 1rem',
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '10px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '6px',
                              background: isBorrower ? 'rgba(37, 99, 235, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: isBorrower ? 'var(--accent-blue)' : 'var(--accent-green)',
                            }}
                          >
                            {isBorrower ? '🏢 EMPRUNTEUR' : '💰 PRÊTEUR'}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            {acc.firstName ? `${acc.firstName} ${acc.userRole ? `(${acc.userRole})` : ''}` : acc.name}
                          </span>
                          {acc.multisigActive === 1 && (
                            <span style={{ fontSize: '0.65rem', background: '#10b981', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                              2/2 MULTISIG
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {acc.address}
                        </div>
                        {acc.company && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            Société : <strong>{acc.company}</strong>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontWeight: 600, fontSize: '0.8rem' }}
                        onClick={() => {
                          connectAccount({
                            address: acc.address,
                            name: acc.name,
                          })
                        }}
                      >
                        Connecter →
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* CONTENU ONGLET 2: CREER NOUVEAU COMPTE */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreateAccount} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                Type de profil sur la plateforme
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <button
                  type="button"
                  className={`btn ${newRole === 'borrower' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setNewRole('borrower')}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.75rem', gap: '0.25rem' }}
                >
                  <span style={{ fontSize: '1.25rem' }}>🏢</span>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Emprunteur</span>
                  <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>Émetteur AT1 · Clé Opérateur</span>
                </button>
                <button
                  type="button"
                  className={`btn ${newRole === 'lender' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setNewRole('lender')}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.75rem', gap: '0.25rem' }}
                >
                  <span style={{ fontSize: '1.25rem' }}>💰</span>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Prêteur / Investisseur</span>
                  <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>Allocation & Retrait Yield</span>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                Prénom du Représentant <span style={{ color: 'var(--accent-red)' }}>*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="ex: Alexandre, Marc, Sophie..."
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                required
              />
            </div>

            {newRole === 'borrower' && (
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                  Rôle / Titre
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex: Directeur Financier (CFO), Trésorier..."
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                Entité / Société
              </label>
              <input
                type="text"
                className="form-input"
                placeholder={newRole === 'borrower' ? 'ex: AT1 Capital Corp' : 'ex: Fixed Income Fund'}
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
              />
            </div>

            <div
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
              }}
            >
              💡 Le compte recevra <strong>1 000 XRP</strong> immédiatement depuis le robinet Devnet et sera enregistré dans la base de données locale du service.
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={isCreating}
              style={{ padding: '0.75rem', fontWeight: 600, marginTop: '0.5rem' }}
            >
              {isCreating ? '⏳ Création & Financement du compte on-chain...' : `✓ Créer le compte ${newRole === 'borrower' ? 'Emprunteur' : 'Prêteur'}`}
            </button>
          </form>
        )}

        {/* CONTENU ONGLET 3: WALLETCONNECT */}
        {activeTab === 'wc' && (
          <div>
            {errorMsg && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                {errorMsg}
                <div style={{ marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={startWcSession}>
                    Réessayer
                  </button>
                </div>
              </div>
            )}

            {isInitializingWc && !pairingUri && !errorMsg && (
              <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>🔄</div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                  Génération du lien WalletConnect...
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  Connexion au relais XRPL
                </div>
              </div>
            )}

            {pairingUri && (
              <div>
                <div
                  style={{
                    background: '#ffffff',
                    padding: '12px',
                    borderRadius: '12px',
                    width: '184px',
                    height: '184px',
                    margin: '0 auto 1.25rem auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(
                      pairingUri
                    )}`}
                    alt="WalletConnect QR Code"
                    style={{ width: '160px', height: '160px', display: 'block' }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <button
                    type="button"
                    className={`btn ${copied ? 'btn-success' : 'btn-primary'} btn-block`}
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                    }}
                    onClick={handleCopy}
                  >
                    {copied ? '✓ Lien copié !' : '📋 Copier le lien WalletConnect (wc:...)'}
                  </button>
                </div>

                <div
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '0.85rem',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Collez ce lien dans votre extension (ex: Crossmark) ou scannez le QR code avec Xaman.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
