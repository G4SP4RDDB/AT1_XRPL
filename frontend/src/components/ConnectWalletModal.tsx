import { useState, useEffect } from 'react'
import type { FC, FormEvent } from 'react'
import { useWallet } from '@/lib/wallet'
import { walletManager } from '@/lib/xrplConnect'

interface ConnectWalletModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ConnectWalletModal: FC<ConnectWalletModalProps> = ({ isOpen, onClose }) => {
  const { connectWalletConnect, connectWithSeed, connectWithAddress, isConnected } = useWallet()
  const [tab, setTab] = useState<'walletconnect' | 'manual'>('walletconnect')
  const [pairingUri, setPairingUri] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [brokerCopied, setBrokerCopied] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [manualInput, setManualInput] = useState('')
  const [isConnectingManual, setIsConnectingManual] = useState(false)

  const BROKER_ADDRESS = 'r4araZQfT6Wn4jr2QkiGevUzb6ABFvnBg4'

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
    if (isOpen && !isConnected && tab === 'walletconnect') {
      startSession()
    }
  }, [isOpen, isConnected, tab])

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

  const handleCopyBroker = async () => {
    try {
      await navigator.clipboard.writeText(BROKER_ADDRESS)
      setBrokerCopied(true)
      setTimeout(() => setBrokerCopied(false), 2500)
    } catch {
      // ignore
    }
  }

  const handleManualConnect = async (e: FormEvent) => {
    e.preventDefault()
    if (!manualInput.trim()) return
    setIsConnectingManual(true)
    setErrorMsg(null)

    try {
      const val = manualInput.trim()
      if (val.startsWith('s') || val.startsWith('sEd')) {
        await connectWithSeed(val)
      } else if (val.startsWith('r')) {
        await connectWithAddress(val)
      } else {
        throw new Error('Please enter a valid XRPL address (r...) or secret seed (sEd... / s...)')
      }
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect wallet')
    } finally {
      setIsConnectingManual(false)
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
            <h3 className="card-title" style={{ fontSize: '1.25rem', margin: 0 }}>
              Connect Your Wallet
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              XRPL Lending Protocol Hackathon Devnet
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Platform Broker Information Card */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '0.9rem 1.1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              🛡️ Platform Broker Address
            </span>
            <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '0.15rem 0.55rem', borderRadius: '9999px', fontWeight: 600 }}>
              Underwriter
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <code style={{ fontSize: '0.86rem', color: 'var(--text-primary)', wordBreak: 'break-all', fontWeight: 600 }}>
              {BROKER_ADDRESS}
            </code>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', flexShrink: 0 }}
              onClick={handleCopyBroker}
            >
              {brokerCopied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.4rem 0 0 0', lineHeight: 1.4 }}>
            All XLS-65 vaults and risk parameters are structured through this broker. Connect your personal wallet to borrow or invest.
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'walletconnect' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
            onClick={() => setTab('walletconnect')}
          >
            📲 XRPL Wallet (Xaman / Crossmark)
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
            onClick={() => setTab('manual')}
          >
            🔑 Faucet Seed / Address
          </button>
        </div>

        {errorMsg && (
          <div className="alert alert-danger" style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>
            {errorMsg}
          </div>
        )}

        {/* Tab 1: WalletConnect / Standard XRPL Connector */}
        {tab === 'walletconnect' && (
          <div>
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
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                    border: '1px solid var(--border-subtle)',
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

                <div style={{ marginBottom: '1.25rem' }}>
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
                        <span>Copy WalletConnect URI</span>
                      </>
                    )}
                  </button>
                </div>

                <div
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '0.9rem',
                    fontSize: '0.82rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                    How to connect:
                  </div>
                  <div>1. Open your <strong>Xaman</strong>, <strong>Crossmark</strong>, or <strong>GemWallet</strong> mobile app.</div>
                  <div>2. Scan the QR code above, or tap "Copy URI" and paste into your wallet's dApp browser.</div>
                  <div>3. Confirm the session request.</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Manual Faucet / Seed Entry */}
        {tab === 'manual' && (
          <form onSubmit={handleManualConnect}>
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" style={{ fontSize: '0.85rem' }}>
                Account Secret Seed (or Classic Address)
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. sEd... or r..."
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                required
                style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}
              />
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                Paste the <code>secret</code> seed returned from the hackathon faucet (<code>curl -X POST https://lending-hackathon-faucet.dev.ripplex.io/accounts</code>) to borrow or fund on-chain.
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={isConnectingManual || !manualInput.trim()}
              style={{ padding: '0.75rem', fontWeight: 600, fontSize: '0.9rem' }}
            >
              {isConnectingManual ? 'Connecting...' : 'Connect With Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
