import { useState, useEffect, createElement } from 'react'
import type { FC } from 'react'
import { WalletProvider, useWallet } from '@/lib/wallet'
import { walletManager } from '@/lib/xrplConnect'
import { Navbar } from '@/components/Navbar'
import { FinanceBonds } from '@/components/FinanceBonds'
import { IssueBond } from '@/components/IssueBond'
import { MyPositions } from '@/components/MyPositions'
import { TrancheBook } from '@/components/TrancheBook'
import { DevExPanel } from '@/components/DevExPanel'
import { ConnectWalletModal } from '@/components/ConnectWalletModal'
import { BankProfileModal } from '@/components/BankProfileModal'
import { loadProfile } from '@/lib/bankProfiles'

const MainContent: FC = () => {
  const { isConnected, isModalOpen, openModal, closeModal, currentAccount } = useWallet()
  // If we're loaded (or reloaded, or opened in a new tab) on a #/orderbook/<id> link — e.g.
  // from a Finance Bonds row's middle-click / open-in-new-tab — land straight on that tab.
  const [activeTab, setActiveTab] = useState<'finance' | 'issue' | 'positions' | 'orderbook'>(() =>
    window.location.hash.startsWith('#/orderbook') ? 'orderbook' : 'finance'
  )
  const [isBankProfileModalOpen, setIsBankProfileModalOpen] = useState(false)
  const [onboardedAddress, setOnboardedAddress] = useState<string | null>(null)

  // First time we see a connected address with no bank profile yet, prompt onboarding once.
  useEffect(() => {
    const address = currentAccount?.address
    if (!address || address === onboardedAddress) return
    let cancelled = false
    loadProfile(address).then((profile) => {
      if (cancelled) return
      setOnboardedAddress(address)
      if (!profile) setIsBankProfileModalOpen(true)
    })
    return () => {
      cancelled = true
    }
  }, [currentAccount?.address, onboardedAddress])

  useEffect(() => {
    const initConnector = () => {
      const el = document.getElementById('xrpl-wallet-connector-ui') as any
      if (el && typeof el.setWalletManager === 'function') {
        el.setWalletManager(walletManager)
      }
    }
    initConnector()
    if (typeof customElements !== 'undefined' && customElements.whenDefined) {
      customElements.whenDefined('xrpl-wallet-connector').then(initConnector).catch(() => {})
    }
  }, [])

  return (
    <div className="app-container">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onEditBankProfile={() => setIsBankProfileModalOpen(true)}
      />

      <main style={{ minHeight: '60vh', padding: '1rem 0' }}>
        {!isConnected ? (
          <div style={{ maxWidth: '780px', margin: '3rem auto', textAlign: 'center' }}>
            <div className="card" style={{ padding: '3.5rem 2.5rem', background: '#ffffff', border: '1px solid var(--border-subtle)', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)' }}>
              <div style={{ display: 'inline-flex', padding: '0.65rem', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '2rem' }}>🏛️</span>
              </div>
              <h2 className="section-title" style={{ fontSize: '2.1rem', marginBottom: '0.85rem' }}>
                AT1 Bond Issuance Platform
              </h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.05rem', lineHeight: '1.6', maxWidth: '580px', margin: '0 auto 2.5rem' }}>
                Institutional contingent convertible bond issuance & fixed yield investment powered by XRPL Single Asset Vaults (XLS-65) and Lending Protocol (XLS-66).
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem', textAlign: 'left', marginBottom: '2.5rem' }}>
                <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>🔐</div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.35rem', color: 'var(--text-primary)' }}>Isolated Vaults</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.45' }}>XLS-65 Single Asset Vault automatically created per bond issuance.</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>📈</div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.35rem', color: 'var(--text-primary)' }}>Passive Yield</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.45' }}>Coupons raise Share PPS directly. Redeem yield anytime without touching principal.</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>🛡️</div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.35rem', color: 'var(--text-primary)' }}>Call Date Lock</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.45' }}>Multisig enforcer policy gates final repayment until the verified call date.</div>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '0.9rem 2.5rem', fontSize: '1.05rem' }}
                onClick={openModal}
              >
                Connect Wallet to Get Started
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'finance' && (
              <FinanceBonds onNavigateToOrderBook={() => setActiveTab('orderbook')} />
            )}
            {activeTab === 'issue' && (
              <IssueBond onSuccess={() => setActiveTab('finance')} />
            )}
            {activeTab === 'positions' && <MyPositions />}
            {activeTab === 'orderbook' && <TrancheBook />}
          </>
        )}
      </main>

      <DevExPanel />

      <ConnectWalletModal isOpen={isModalOpen} onClose={closeModal} />

      <BankProfileModal
        isOpen={isBankProfileModalOpen}
        address={currentAccount?.address}
        onClose={() => setIsBankProfileModalOpen(false)}
        onSaved={() => setIsBankProfileModalOpen(false)}
      />

      {/* Official XRPL Connect Web Component Modal */}
      {createElement('xrpl-wallet-connector', {
        id: 'xrpl-wallet-connector-ui',
        'background-color': '#161f30',
        'primary-wallet': 'walletconnect',
        style: {
          position: 'fixed',
          bottom: '-9999px',
          right: '-9999px',
          opacity: 0,
          pointerEvents: 'none',
        },
      })}
    </div>
  )
}

export default function App() {
  return (
    <WalletProvider>
      <MainContent />
    </WalletProvider>
  )
}
