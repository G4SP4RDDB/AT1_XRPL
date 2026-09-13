import { useState, useEffect } from 'react'
import type { FC } from 'react'
import { useWallet } from '@/lib/wallet'
import { walletManager } from '@/lib/xrplConnect'
import { chainClient } from '@/lib/chainClient'
import type { DbAccount } from '@shared/types'

interface ConnectWalletModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenSetupModal?: (address?: string) => void
}

const ADAPTERS = [
  { id: 'gemwallet' as const, label: 'GemWallet', icon: '💎', hint: 'Extension navigateur' },
  { id: 'crossmark' as const, label: 'Crossmark', icon: '✖️', hint: 'Extension navigateur' },
  { id: 'walletconnect' as const, label: 'Xaman', icon: '📱', hint: 'QR code / WalletConnect' },
]

export const ConnectWalletModal: FC<ConnectWalletModalProps> = ({ isOpen, onClose }) => {
  const { connectAdapter, selectRoleAccount, isConnected } = useWallet()
  const [activeTab, setActiveTab] = useState<'wallet' | 'registered'>('wallet')

  const [dbAccounts, setDbAccounts] = useState<DbAccount[]>([])
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)

  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [pairingUri, setPairingUri] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
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
    if (isOpen && activeTab === 'registered') loadAccountsFromDb()
  }, [isOpen, activeTab])

  useEffect(() => {
    if (isConnected && isOpen) onClose()
  }, [isConnected, isOpen, onClose])

  const handleConnectAdapter = async (id: 'gemwallet' | 'crossmark' | 'walletconnect') => {
    setConnectingId(id)
    setErrorMsg(null)
    setPairingUri(null)
    try {
      const el = document.getElementById('xrpl-wallet-connector-ui') as any
      if (el && typeof el.setWalletManager === 'function') el.setWalletManager(walletManager)

      await connectAdapter(id, (uri: string) => setPairingUri(uri))
    } catch (err: any) {
      setErrorMsg(err?.message || `Connexion à ${id} impossible — l'extension est-elle installée et pointée sur le devnet du hackathon ?`)
    } finally {
      setConnectingId(null)
    }
  }

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

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '620px', padding: '2rem', borderRadius: '16px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h3 className="card-title" style={{ fontSize: '1.25rem', margin: 0 }}>
              Connexion
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Emprunteurs et prêteurs sont des comptes indépendants — l'app ne connaît que leur adresse publique
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'wallet' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('wallet')}
            style={{ borderRadius: '8px' }}
          >
            🔐 Wallet réel
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'registered' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('registered')}
            style={{ borderRadius: '8px' }}
          >
            👥 Comptes enregistrés ({dbAccounts.length || '...'})
          </button>
        </div>

        {activeTab === 'wallet' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {errorMsg && (
              <div className="alert alert-danger" style={{ fontSize: '0.85rem' }}>
                {errorMsg}
              </div>
            )}

            {pairingUri ? (
              <div>
                <div
                  style={{
                    background: '#ffffff', padding: '12px', borderRadius: '12px', width: '184px', height: '184px',
                    margin: '0 auto 1.25rem auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(pairingUri)}`}
                    alt="WalletConnect QR Code"
                    style={{ width: '160px', height: '160px', display: 'block' }}
                  />
                </div>
                <button
                  type="button"
                  className={`btn ${copied ? 'btn-success' : 'btn-primary'} btn-block`}
                  style={{ padding: '0.75rem 1rem', fontSize: '0.9rem', fontWeight: 600, borderRadius: '10px', marginBottom: '0.75rem' }}
                  onClick={handleCopy}
                >
                  {copied ? '✓ Lien copié !' : '📋 Copier le lien WalletConnect (wc:...)'}
                </button>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  Scannez ce QR code avec Xaman, ou collez le lien dans l'app.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {ADAPTERS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="btn btn-secondary"
                    disabled={connectingId !== null}
                    onClick={() => handleConnectAdapter(a.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.1rem' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 600 }}>
                      <span style={{ fontSize: '1.2rem' }}>{a.icon}</span>
                      <span>{connectingId === a.id ? `Connexion à ${a.label}...` : a.label}</span>
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.hint}</span>
                  </button>
                ))}
              </div>
            )}

            <div
              style={{
                background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '10px',
                padding: '0.85rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5,
              }}
            >
              Pas encore de compte financé ? Lancez <code>npm run create-accounts</code> à la racine du projet,
              importez la seed affichée dans GemWallet, Crossmark ou Xaman, puis connectez-vous ici.
              Vous choisirez ensuite votre rôle (emprunteur ou prêteur) au premier lancement.
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => selectRoleAccount('broker')}
              style={{ alignSelf: 'center', fontSize: '0.78rem' }}
            >
              🏛️ Se connecter en tant que Courtier Plateforme (compte fixe)
            </button>
          </div>
        )}

        {activeTab === 'registered' && (
          <div>
            {isLoadingAccounts ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                <span>⏳ Chargement des comptes depuis la base SQLite...</span>
              </div>
            ) : dbAccounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--bg-surface-elevated)', borderRadius: '12px', border: '1px dashed var(--border-subtle)' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📭</div>
                <div style={{ fontWeight: 600 }}>Aucun compte enregistré pour le moment</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                  Un compte apparaît ici après sa première connexion réelle et son choix de rôle.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                {dbAccounts.map((acc) => {
                  const isBorrower = acc.role === 'borrower'
                  const isLender = acc.role === 'lender'
                  return (
                    <div
                      key={acc.address}
                      style={{ padding: '0.75rem 1rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '10px' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span
                          style={{
                            fontSize: '0.72rem', fontWeight: 700, padding: '2px 7px', borderRadius: '6px',
                            background: isBorrower ? 'rgba(37, 99, 235, 0.15)' : isLender ? 'rgba(16, 185, 129, 0.15)' : 'rgba(147, 51, 234, 0.15)',
                            color: isBorrower ? 'var(--accent-blue)' : isLender ? 'var(--accent-green)' : '#9333ea',
                          }}
                        >
                          {isBorrower ? '🏢 EMPRUNTEUR' : isLender ? '💰 PRÊTEUR' : '🏛️ COURTIER'}
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
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{acc.address}</div>
                      {acc.company && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Société : <strong>{acc.company}</strong>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem', textAlign: 'center' }}>
              Lecture seule — connectez le wallet réel correspondant depuis l'onglet "Wallet réel" pour agir en tant que ce compte.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
