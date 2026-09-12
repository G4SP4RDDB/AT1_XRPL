import { useState, useEffect } from 'react'
import type { FC } from 'react'
import { useWallet } from '@/lib/wallet'
import { walletManager } from '@/lib/xrplConnect'
import { chainClient } from '@/lib/chainClient'
import { notifyTx } from '@/lib/notifications'
import type { DbAccount, AccountRole, CreatedAccount } from '@shared/types'

interface ConnectWalletModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenSetupModal?: (address?: string) => void
}

export const ConnectWalletModal: FC<ConnectWalletModalProps> = ({ isOpen, onClose, onOpenSetupModal }) => {
  const { connectWalletConnect, connectAccount, isConnected } = useWallet()
  const [activeTab, setActiveTab] = useState<'db' | 'created' | 'create' | 'wc'>('db')
  
  // Stored accounts state
  const [dbAccounts, setDbAccounts] = useState<DbAccount[]>([])
  const [createdAccounts, setCreatedAccounts] = useState<CreatedAccount[]>([])
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)

  // In-line role editing state
  const [editingAddress, setEditingAddress] = useState<string | null>(null)
  const [editRole, setEditRole] = useState<AccountRole>('unassigned')
  const [editFirstName, setEditFirstName] = useState('')
  const [editUserRole, setEditUserRole] = useState('')
  const [editCompany, setEditCompany] = useState('')
  const [isSavingRole, setIsSavingRole] = useState(false)

  // Account creation state
  const [newRole, setNewRole] = useState<AccountRole>('borrower')
  const [newFirstName, setNewFirstName] = useState('')
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
      const [accounts, created] = await Promise.all([
        chainClient.listAccounts(),
        chainClient.getCreatedAccounts(),
      ])
      setDbAccounts(accounts || [])
      setCreatedAccounts(created || [])
    } catch (err) {
      console.warn('Could not load accounts:', err)
    } finally {
      setIsLoadingAccounts(false)
    }
  }

  const handleWipeCreated = async () => {
    await chainClient.wipeCreatedAccounts()
    notifyTx({
      title: 'Fichier réinitialisé',
      message: 'Les comptes ont été effacés (wipe) de created_accounts.json.',
      type: 'info',
    })
    await loadAccountsFromDb()
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

  const handleStartEdit = (acc: DbAccount) => {
    setEditingAddress(acc.address)
    setEditRole(acc.role)
    setEditFirstName(acc.firstName || '')
    setEditUserRole(acc.userRole || '')
    setEditCompany(acc.company || '')
  }

  const handleSaveRole = async (address: string) => {
    setIsSavingRole(true)
    try {
      const updated = await chainClient.updateAccount({
        address,
        role: editRole,
        firstName: editFirstName.trim() || undefined,
        userRole: editUserRole.trim() || undefined,
        company: editCompany.trim() || undefined,
        name: editFirstName.trim()
          ? `${editFirstName.trim()} (${editCompany.trim() || (editRole === 'borrower' ? 'Emprunteur' : editRole === 'broker' ? 'Courtier' : editRole === 'lender' ? 'Prêteur' : 'Compte')})`
          : editRole === 'borrower' ? 'Emprunteur' : editRole === 'broker' ? 'Courtier Plateforme' : editRole === 'lender' ? 'Prêteur' : 'Compte Aléatoire',
      })

      notifyTx({
        title: 'Rôle & Profil mis à jour',
        message: `Le compte ${updated.address.slice(0, 8)}... est maintenant configuré en tant que ${editRole === 'borrower' ? 'Emprunteur' : editRole === 'broker' ? 'Courtier (Broker)' : editRole === 'lender' ? 'Prêteur' : 'Non assigné'}.`,
        type: 'success',
      })

      await loadAccountsFromDb()
      setEditingAddress(null)
    } catch (err: any) {
      notifyTx({
        title: 'Erreur mise à jour',
        message: err.message,
        type: 'error',
      })
    } finally {
      setIsSavingRole(false)
    }
  }

  // 1-Click Random Account Creation (funded on Devnet, setup at connection)
  const handleCreateRandom = async () => {
    setIsCreating(true)
    try {
      const created = await chainClient.createRandomAccount()
      notifyTx({
        title: 'Compte Devnet généré !',
        message: `Adresse ${created.address.slice(0, 8)}... financée avec 1 000 XRP. Définissez son rôle et profil pour l'enregistrer en base.`,
        type: 'success',
      })
      connectAccount({
        address: created.address,
        name: created.name,
        role: 'unassigned',
      })
      onClose()
      onOpenSetupModal?.(created.address)
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

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    try {
      const name = newRole === 'borrower'
        ? `${newFirstName || 'Emprunteur'} (${newCompany || 'Société'})`
        : newRole === 'broker'
        ? `${newFirstName || 'Courtier'} (${newCompany || 'Plateforme'})`
        : `${newFirstName || 'Investisseur'} (${newCompany || 'Fonds'})`

      const created = await chainClient.createAccount({
        role: newRole,
        name,
        company: newCompany.trim() || undefined,
        firstName: newFirstName.trim() || undefined,
        userRole: newRole === 'borrower' ? 'Directeur Financier (CFO)' : newRole === 'broker' ? 'Structurateur & Risque' : 'Gestionnaire de Portefeuille',
      })

      // Setup/enregistrement dans la base SQLite à la première connexion / setup
      await chainClient.updateAccount({
        address: created.address,
        role: newRole,
        name,
        company: newCompany.trim() || undefined,
        firstName: newFirstName.trim() || undefined,
        userRole: newRole === 'borrower' ? 'Directeur Financier (CFO)' : newRole === 'broker' ? 'Structurateur & Risque' : 'Gestionnaire de Portefeuille',
      })

      notifyTx({
        title: `Compte ${newRole === 'borrower' ? 'Emprunteur' : newRole === 'broker' ? 'Courtier' : 'Prêteur'} configuré & enregistré !`,
        message: `Adresse ${created.address.slice(0, 8)}... connectée et enregistrée en base SQLite.`,
        type: 'success',
      })

      await loadAccountsFromDb()
      connectAccount({
        address: created.address,
        name,
        role: newRole,
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
          maxWidth: '620px',
          padding: '2rem',
          borderRadius: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h3 className="card-title" style={{ fontSize: '1.25rem', margin: 0 }}>
              Sélection & Gestion des Comptes
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              XRPL Custom Devnet · Les clés sont stockées en DB locale · Vous gérez librement le rôle de chaque compte
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
            👥 En Base ({dbAccounts.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'created' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('created')}
            style={{ borderRadius: '8px' }}
          >
            📋 Comptes Créés ({createdAccounts.length})
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
                  Générez un compte aléatoire financé à 1 000 XRP en 1 clic et attribuez-lui son rôle.
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleCreateRandom} disabled={isCreating}>
                  ⚡ Créer un Compte Aléatoire (1 000 XRP)
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                {dbAccounts.map((acc) => {
                  const isEditing = editingAddress === acc.address
                  const isBorrower = acc.role === 'borrower'
                  const isLender = acc.role === 'lender'
                  const isBroker = acc.role === 'broker'

                  return (
                    <div
                      key={acc.address}
                      style={{
                        padding: '0.85rem 1rem',
                        background: 'var(--bg-surface-elevated)',
                        border: isEditing ? '1px solid var(--accent-blue)' : '1px solid var(--border-subtle)',
                        borderRadius: '10px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: '6px',
                                background: isBorrower
                                  ? 'rgba(37, 99, 235, 0.15)'
                                  : isLender
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : isBroker
                                  ? 'rgba(147, 51, 234, 0.15)'
                                  : 'rgba(100, 116, 139, 0.15)',
                                color: isBorrower
                                  ? 'var(--accent-blue)'
                                  : isLender
                                  ? 'var(--accent-green)'
                                  : isBroker
                                  ? '#9333ea'
                                  : 'var(--text-muted)',
                              }}
                            >
                              {isBorrower ? '🏢 EMPRUNTEUR' : isLender ? '💰 PRÊTEUR' : isBroker ? '🏛️ COURTIER' : '⚪ NON ASSIGNÉ'}
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

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontWeight: 500, fontSize: '0.78rem' }}
                            onClick={() => (isEditing ? setEditingAddress(null) : handleStartEdit(acc))}
                            title="Changer le rôle et les informations de ce compte"
                          >
                            {isEditing ? 'Fermer' : '⚙️ Rôle'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ fontWeight: 600, fontSize: '0.8rem' }}
                            onClick={() => {
                              connectAccount({
                                address: acc.address,
                                name: acc.name,
                                role: acc.role,
                              })
                            }}
                          >
                            Connecter →
                          </button>
                        </div>
                      </div>

                      {/* INLINE ROLE & PROFILE MANAGER */}
                      {isEditing && (
                        <div
                          style={{
                            marginTop: '0.85rem',
                            paddingTop: '0.85rem',
                            borderTop: '1px solid var(--border-subtle)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem',
                          }}
                        >
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Définir personnellement le rôle de ce compte :
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                            <button
                              type="button"
                              className={`btn btn-sm ${editRole === 'borrower' ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setEditRole('borrower')}
                              style={{ fontSize: '0.75rem', padding: '0.4rem' }}
                            >
                              🏢 Emprunteur
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm ${editRole === 'lender' ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setEditRole('lender')}
                              style={{ fontSize: '0.75rem', padding: '0.4rem' }}
                            >
                              💰 Prêteur
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm ${editRole === 'broker' ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setEditRole('broker')}
                              style={{ fontSize: '0.75rem', padding: '0.4rem', borderColor: editRole === 'broker' ? '#9333ea' : undefined, background: editRole === 'broker' ? '#9333ea' : undefined }}
                            >
                              🏛️ Courtier
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm ${editRole === 'unassigned' ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setEditRole('unassigned')}
                              style={{ fontSize: '0.75rem', padding: '0.4rem' }}
                            >
                              ⚪ Libre
                            </button>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Prénom du représentant..."
                              style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                              value={editFirstName}
                              onChange={(e) => setEditFirstName(e.target.value)}
                            />
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Société / Entité..."
                              style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                              value={editCompany}
                              onChange={(e) => setEditCompany(e.target.value)}
                            />
                          </div>

                          {editRole === 'borrower' && (
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Titre (ex: CFO, Trésorier)..."
                              style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                              value={editUserRole}
                              onChange={(e) => setEditUserRole(e.target.value)}
                            />
                          )}

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setEditingAddress(null)}
                              style={{ fontSize: '0.75rem' }}
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={isSavingRole}
                              onClick={() => handleSaveRole(acc.address)}
                              style={{ fontSize: '0.75rem', fontWeight: 600 }}
                            >
                              {isSavingRole ? 'Enregistrement...' : '✓ Valider ce rôle'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* CONTENU ONGLET: COMPTES CRÉÉS RÉCENTS (created_accounts.json) */}
        {activeTab === 'created' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Fichier <code>created_accounts.json</code> · Comptes financés prêts pour le 1er onboarding
              </div>
              {createdAccounts.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleWipeCreated}
                  style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                  title="Vider le fichier created_accounts.json"
                >
                  🧹 Vider la liste (Wipe)
                </button>
              )}
            </div>

            {createdAccounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--bg-surface-elevated)', borderRadius: '12px', border: '1px dashed var(--border-subtle)' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📄</div>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Aucun compte dans created_accounts.json</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Générez un compte pour tester ou lancez <code>npm run create-accounts</code> dans votre terminal.
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleCreateRandom} disabled={isCreating}>
                  ⚡ Créer un Compte (1 000 XRP)
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                {createdAccounts.map((acc, idx) => (
                  <div
                    key={acc.address}
                    style={{
                      padding: '0.85rem 1rem',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
                          #{idx + 1}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{acc.name}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          · {acc.balanceXrp} XRP
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                        {acc.address}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Seed: <code style={{ fontSize: '0.68rem' }}>{acc.seed}</code>
                      </div>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          connectAccount({
                            address: acc.address,
                            name: acc.name,
                            role: 'unassigned',
                          })
                          onClose()
                          onOpenSetupModal?.(acc.address)
                        }}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        🚀 Se connecter & Configurer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CONTENU ONGLET 3: CREER NOUVEAU COMPTE */}
        {activeTab === 'create' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* OPTION 1: CRÉER UN COMPTE ALÉATOIRE (1 CLIC) */}
            <div
              style={{
                padding: '1.25rem',
                background: 'rgba(37, 99, 235, 0.08)',
                borderRadius: '12px',
                border: '1px solid rgba(37, 99, 235, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>⚡</span>
                    <span>Créer un Compte Aléatoire (1 000 XRP)</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px', lineHeight: 1.4 }}>
                    Financé instantanément depuis le Devnet sans aucun rôle pré-défini. Vous gérez son rôle personnellement.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCreateRandom}
                  disabled={isCreating}
                  style={{ whiteSpace: 'nowrap', fontWeight: 600, padding: '0.65rem 1.25rem' }}
                >
                  {isCreating ? '⏳ Création...' : 'Générer en 1 clic →'}
                </button>
              </div>
            </div>

            <div style={{ textAlign: 'center', position: 'relative' }}>
              <div style={{ borderTop: '1px solid var(--border-subtle)' }} />
              <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: '#fff', padding: '0 10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                OU PRÉ-CONFIGURER À LA CRÉATION
              </span>
            </div>

            {/* OPTION 2: FORMULAIRE PERSONNALISÉ */}
            <form onSubmit={handleCreateAccount} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                  Rôle initial
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${newRole === 'borrower' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setNewRole('borrower')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.5rem' }}
                  >
                    <span>🏢</span>
                    <span style={{ fontWeight: 600 }}>Emprunteur</span>
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${newRole === 'lender' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setNewRole('lender')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.5rem' }}
                  >
                    <span>💰</span>
                    <span style={{ fontWeight: 600 }}>Prêteur</span>
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${newRole === 'broker' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setNewRole('broker')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.5rem', borderColor: newRole === 'broker' ? '#9333ea' : undefined, background: newRole === 'broker' ? '#9333ea' : undefined }}
                  >
                    <span>🏛️</span>
                    <span style={{ fontWeight: 600 }}>Courtier</span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                    Prénom <span style={{ color: 'var(--accent-red)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="ex: Alexandre, Sophie..."
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                    Société / Entité
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="ex: AT1 Capital Corp"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-secondary btn-block"
                disabled={isCreating}
                style={{ padding: '0.65rem', fontWeight: 600, marginTop: '0.25rem' }}
              >
                {isCreating ? '⏳ Création on-chain...' : `Créer le compte ${newRole === 'borrower' ? 'Emprunteur' : 'Prêteur'}`}
              </button>
            </form>
          </div>
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
