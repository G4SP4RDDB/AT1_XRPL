import { useState, useEffect } from 'react'
import type { FC } from 'react'
import { useWallet } from '@/lib/wallet'
import { walletManager } from '@/lib/xrplConnect'

interface ConnectWalletModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ConnectWalletModal: FC<ConnectWalletModalProps> = ({ isOpen, onClose }) => {
  const { connectWalletConnect, selectRoleAccount, isConnected } = useWallet()
  const [pairingUri, setPairingUri] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const startSession = async () => {
    setIsInitializing(true)
    setErrorMsg(null)
    setPairingUri(null)

    // Trigger underlying web component if present
    const el = document.getElementById('xrpl-wallet-connector-ui') as any
    if (el) {
      if (typeof el.setWalletManager === 'function') {
        el.setWalletManager(walletManager)
      }
      if (typeof el.open === 'function') {
        el.open()
      }
    }

    try {
      await connectWalletConnect((uri: string) => {
        setPairingUri(uri)
        setIsInitializing(false)
      })
    } catch (err: any) {
      const msg = err?.message || 'Connection failed'
      setErrorMsg(msg)
      setIsInitializing(false)
    }
  }

  useEffect(() => {
    if (isOpen && !isConnected) {
      startSession()
    }
  }, [isOpen, isConnected])

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

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{
          maxWidth: '520px',
          padding: '2rem',
          borderRadius: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h3 className="card-title" style={{ fontSize: '1.2rem', margin: 0 }}>
              Select Account or Connect Wallet
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              XRPL Lending Hackathon Devnet
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Quick Demo Role Picker */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            ⚡ Quick-Select On-Chain Role
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.65rem 0.8rem', textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem' }}
              onClick={() => selectRoleAccount('borrower')}
            >
              <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)' }}>🏛️ Borrower</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Multisig Issuer (2-of-2)</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.65rem 0.8rem', textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem' }}
              onClick={() => selectRoleAccount('lender1')}
            >
              <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--accent-green)' }}>💼 Lender 1</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Primary Depositor</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.65rem 0.8rem', textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem' }}
              onClick={() => selectRoleAccount('lender2')}
            >
              <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--accent-blue)' }}>💼 Lender 2</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Secondary Investor</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.65rem 0.8rem', textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem' }}
              onClick={() => selectRoleAccount('broker')}
            >
              <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--accent-amber)' }}>🛡️ Platform Broker</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>First-Loss & Enforcer</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', margin: '1rem 0', gap: '0.75rem' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>OR WALLETCONNECT</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
        </div>

        {errorMsg && (
          <div className="alert alert-danger" style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>
            {errorMsg}
            <div style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={startSession}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {isInitializing && !pairingUri && !errorMsg && (
          <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>🔄</div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
              Generating WalletConnect pairing link...
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Connecting to XRPL relay
            </div>
          </div>
        )}

        {pairingUri && (
          <div>
            {/* QR Code display */}
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

            {/* Copy Pairing URI Button */}
            <div style={{ marginBottom: '1.5rem' }}>
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
                {copied ? (
                  <>
                    <span>✓</span>
                    <span>URI copied to clipboard!</span>
                  </>
                ) : (
                  <>
                    <span>📋</span>
                    <span>Copy WalletConnect URI (wc:...)</span>
                  </>
                )}
              </button>
            </div>

            {/* Step-by-step Instructions */}
            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '1rem',
                fontSize: '0.82rem',
                textAlign: 'left',
                lineHeight: '1.5',
                color: 'var(--text-secondary)',
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: '0.5rem',
                  fontSize: '0.85rem',
                }}
              >
                Connection instructions for your browser extension:
              </div>
              <ol style={{ paddingLeft: '1.2rem', margin: 0 }}>
                <li style={{ marginBottom: '0.35rem' }}>
                  Click the button above to copy the <code>wc:...</code> pairing URI.
                </li>
                <li style={{ marginBottom: '0.35rem' }}>
                  In your extension popup (e.g. <strong>Crossmark</strong>), click{' '}
                  <strong style={{ color: 'var(--accent-blue)' }}>+ Connect via WalletConnect</strong>.
                </li>
                <li style={{ marginBottom: '0.35rem' }}>
                  Paste the copied URI and click <strong>Connect</strong>.
                </li>
                <li>
                  Review the connection request and click{' '}
                  <strong style={{ color: 'var(--accent-green)' }}>Approve</strong>.
                </li>
              </ol>
            </div>

            {/* Live status badge */}
            <div
              style={{
                marginTop: '1rem',
                textAlign: 'center',
                fontSize: '0.78rem',
                color: 'var(--accent-amber)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
              }}
            >
              <span className="network-dot" style={{ background: 'var(--accent-amber)' }} />
              <span>Waiting for approval in your extension...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
