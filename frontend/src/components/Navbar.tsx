import type { FC } from 'react'
import { useWallet } from '@/lib/wallet'
import { network } from '@/lib/xrpl'
import { useBankName } from '@/lib/bankProfiles'
import { useBorrowerProfile } from '@/lib/borrowerProfile'

import { TAB_ORDER, canAccessTab } from '@/lib/roles'

type Tab = 'issue' | 'finance' | 'positions' | 'orderbook' | 'broker'

interface NavbarProps {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
  onEditBankProfile: () => void
  onOpenBorrowerProfile?: () => void
}

export const Navbar: FC<NavbarProps> = ({ activeTab, setActiveTab, onEditBankProfile, onOpenBorrowerProfile }) => {
  const { currentAccount, isConnected, disconnect, openModal, refreshBalance } = useWallet()
  const bankName = useBankName(currentAccount?.address)
  const borrowerProfile = useBorrowerProfile(currentAccount?.address)

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
            {TAB_ORDER.filter((t) => canAccessTab(currentAccount?.role, t.id)).map((t) => (
              <button
                key={t.id}
                className={`nav-tab ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
                style={t.id === 'broker' ? { borderColor: '#9333ea', color: '#9333ea', fontWeight: 700 } : {}}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}

        <div className="wallet-badge-group">
          {isConnected && currentAccount ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {currentAccount.role === 'broker' ? (
                <div
                  className="account-pill"
                  onClick={onOpenBorrowerProfile}
                  style={{ cursor: 'pointer', background: 'rgba(147, 51, 234, 0.1)', borderColor: 'rgba(147, 51, 234, 0.3)' }}
                  title="Rôle Courtier Plateforme / Broker (Cliquer pour modifier)"
                >
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#9333ea' }}>
                    🏛️ Courtier (Broker)
                  </span>
                </div>
              ) : currentAccount.role === 'lender' ? (
                <div
                  className="account-pill"
                  onClick={onOpenBorrowerProfile}
                  style={{ cursor: 'pointer', background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                  title="Rôle Prêteur / Investisseur (Cliquer pour modifier)"
                >
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent-green)' }}>
                    💰 Prêteur (Lender)
                  </span>
                </div>
              ) : borrowerProfile ? (
                <div
                  className="account-pill"
                  onClick={onOpenBorrowerProfile}
                  style={{ cursor: 'pointer', background: 'rgba(37, 99, 235, 0.08)', borderColor: 'rgba(37, 99, 235, 0.3)' }}
                  title="Profil Emprunteur & Statut Multisig (Cliquer pour modifier)"
                >
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
                    🏢 {borrowerProfile.firstName}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    ({borrowerProfile.role})
                  </span>
                  {borrowerProfile.multisigActive && (
                    <span style={{ fontSize: '0.65rem', background: '#10b981', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                      2/2 MULTISIG
                    </span>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onOpenBorrowerProfile}
                  style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  title="Définir personnellement le rôle (Emprunteur, Prêteur ou Courtier) de ce compte"
                >
                  <span>⚙️</span>
                  <span>Gérer le Rôle</span>
                </button>
              )}

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
