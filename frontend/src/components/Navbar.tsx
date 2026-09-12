import type { FC } from 'react'
import { useWallet } from '@/lib/wallet'
import { network } from '@/lib/xrpl'
import { useBankName } from '@/lib/bankProfiles'

interface NavbarProps {
  activeTab: 'issue' | 'finance' | 'positions' | 'orderbook'
  setActiveTab: (tab: 'issue' | 'finance' | 'positions' | 'orderbook') => void
  onEditBankProfile: () => void
}

export const Navbar: FC<NavbarProps> = ({ activeTab, setActiveTab, onEditBankProfile }) => {
  const { currentAccount, isConnected, disconnect, openModal, refreshBalance } = useWallet()
  const bankName = useBankName(currentAccount?.address)

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
        </div>

        {isConnected && (
          <nav className="nav-links">
            <button
              className={`nav-tab ${activeTab === 'orderbook' ? 'active' : ''}`}
              onClick={() => setActiveTab('orderbook')}
            >
              Order Book
            </button>
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
                title={`${currentAccount.address}\nClick to refresh on-chain balance from Devnet`}
              >
                <span className="account-balance">{currentAccount.balance}</span>
                <span className="account-address">{bankName}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onEditBankProfile}
                title="Edit bank profile"
              >
                🏦
              </button>
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
