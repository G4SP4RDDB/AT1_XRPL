import type { FC } from 'react'
import { useWallet } from '@/lib/wallet'
import { network } from '@/lib/xrpl'

interface NavbarProps {
  activeTab: 'issue' | 'finance' | 'positions'
  setActiveTab: (tab: 'issue' | 'finance' | 'positions') => void
}

export const Navbar: FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { currentAccount, isConnected, disconnect, openModal, refreshBalance } = useWallet()

  return (
    <>
      <header className="navbar">
        <div className="logo-group">
          <span className="logo-badge">AT1 · XRPL</span>
          <span className="logo-title">Bond Platform</span>
          <span
            style={{
              fontSize: '0.72rem',
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#059669',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontWeight: 600,
            }}
            title={network.wss}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
            Hackathon Devnet
          </span>
          <span
            style={{
              fontSize: '0.72rem',
              background: 'rgba(37, 99, 235, 0.08)',
              color: '#1d4ed8',
              border: '1px solid rgba(37, 99, 235, 0.2)',
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="Click to copy Platform Broker address: r4araZQfT6Wn4jr2QkiGevUzb6ABFvnBg4"
            onClick={() => {
              navigator.clipboard.writeText('r4araZQfT6Wn4jr2QkiGevUzb6ABFvnBg4')
              alert('Platform Broker address copied: r4araZQfT6Wn4jr2QkiGevUzb6ABFvnBg4')
            }}
          >
            <span>🛡️</span>
            <span>Broker: r4araZ...vnBg4</span>
          </span>
        </div>

        {isConnected && (
          <nav className="nav-links">
            <button
              className={`nav-tab ${activeTab === 'finance' ? 'active' : ''}`}
              onClick={() => setActiveTab('finance')}
            >
              Finance Bonds
            </button>
            <button
              className={`nav-tab ${activeTab === 'issue' ? 'active' : ''}`}
              onClick={() => setActiveTab('issue')}
            >
              Issue Bond
            </button>
            <button
              className={`nav-tab ${activeTab === 'positions' ? 'active' : ''}`}
              onClick={() => setActiveTab('positions')}
            >
              My Positions
            </button>
          </nav>
        )}

        <div className="wallet-badge-group">
          {isConnected && currentAccount ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                className="account-pill"
                onClick={refreshBalance}
                style={{ cursor: 'pointer' }}
                title="Click to refresh on-chain balance from Devnet"
              >
                <span className="account-balance">{currentAccount.balance}</span>
                <span className="account-address">
                  {currentAccount.address.slice(0, 6)}...{currentAccount.address.slice(-4)}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={disconnect}
                title="Disconnect wallet"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={openModal}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </header>
    </>
  )
}
