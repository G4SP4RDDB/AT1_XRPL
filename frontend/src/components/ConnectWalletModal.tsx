import { useState, useEffect } from 'react'
import type { FC } from 'react'
import { useWallet, type AdapterId } from '@/lib/wallet'
import { walletManager } from '@/lib/xrplConnect'

interface ConnectWalletModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenSetupModal?: (address?: string) => void
}

const ADAPTERS = [
  { id: 'walletconnect' as const, label: 'WalletConnect', icon: '📱', hint: 'Xaman ou tout wallet compatible WalletConnect — QR code / lien', disabled: false },
]

export const ConnectWalletModal: FC<ConnectWalletModalProps> = ({ isOpen, onClose }) => {
  const { connectAdapter, isConnected } = useWallet()

  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [pairingUri, setPairingUri] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isConnected && isOpen) onClose()
  }, [isConnected, isOpen, onClose])

  const handleConnectAdapter = async (id: AdapterId) => {
    setConnectingId(id)
    setErrorMsg(null)
    setPairingUri(null)
    try {
      const el = document.getElementById('xrpl-wallet-connector-ui') as any
      if (el && typeof el.setWalletManager === 'function') el.setWalletManager(walletManager)

      await connectAdapter(id, (uri: string) => setPairingUri(uri))
    } catch (err: any) {
      setErrorMsg(err?.message || 'Connexion WalletConnect impossible — réessayez ou vérifiez que votre wallet accepte le réseau du hackathon.')
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
                  Scannez ce QR code avec votre wallet WalletConnect (Xaman), ou collez le lien dans l'app.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {ADAPTERS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="btn btn-secondary"
                    disabled={connectingId !== null || a.disabled}
                    title={a.disabled ? a.hint : undefined}
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
              importez la seed affichée dans votre wallet WalletConnect (Xaman), puis scannez le QR code ci-dessus.
              Vous choisirez ensuite votre rôle au premier lancement. Le courtier plateforme se connecte de la même
              façon, avec le wallet qui détient l'adresse broker.
            </div>
          </div>
      </div>
    </div>
  )
}
