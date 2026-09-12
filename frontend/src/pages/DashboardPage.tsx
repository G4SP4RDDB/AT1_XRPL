import { useState, useEffect } from 'react'
import type { FC } from 'react'
import type { VaultState, UserPosition } from '@shared/types'
import { chainClient } from '@/lib/chainClient'
import { useWallet } from '@/lib/wallet'
import { VaultCard } from '@/components/VaultCard'

export const DashboardPage: FC = () => {
  const { currentAccount } = useWallet()
  const [vaults, setVaults] = useState<VaultState[]>([])
  const [userPositions, setUserPositions] = useState<Record<string, UserPosition>>({})
  const [isLoading, setIsLoading] = useState(true)

  const loadData = async () => {
    try {
      const allVaults = await chainClient.getAllVaults()
      setVaults(allVaults)

      const positions: Record<string, UserPosition> = {}
      if (currentAccount) {
        for (const v of allVaults) {
          const pos = await chainClient.getUserPosition(currentAccount.address, v.vaultId)
          if (pos) {
            positions[v.vaultId] = pos
          }
        }
      }
      setUserPositions(positions)
    } catch (err) {
      console.error('Failed to load dashboard data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [currentAccount?.address])

  // Aggregate stats
  const totalAssets = vaults.reduce((acc, v) => acc + Number(v.assetsTotal || 0), 0)
  const totalOnLoan = vaults.reduce((acc, v) => acc + Number(v.loanPrincipal || 0), 0)
  const totalLiquid = vaults.reduce((acc, v) => acc + Number(v.liquidAssets || 0), 0)

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">AT1 Vault Portfolio & Yield Terminal</h2>
          <p className="section-subtitle">
            Open-ended Single Asset Vaults (XLS-65) with principal lock enforced via loan illiquidity and multisig-gated repayments
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadData}>
          Refresh Ledger State
        </button>
      </div>

      {/* Aggregate Financial Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Capital Under Management</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem' }}>
            {totalAssets.toLocaleString()} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>XRP</span>
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Principal Capital Out On Loan</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-amber)', marginTop: '0.25rem' }}>
            {totalOnLoan.toLocaleString()} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>XRP</span>
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Liquid Reserve in Vaults</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-cyan)', marginTop: '0.25rem' }}>
            {totalLiquid.toLocaleString()} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>XRP</span>
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Active AT1 Issuances</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-green)', marginTop: '0.25rem' }}>
            {vaults.length} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Vaults</span>
          </div>
        </div>
      </div>

      {/* Vaults Grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Reading XRPL Devnet vault states...
        </div>
      ) : vaults.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          No active bond vaults found. Go to the <strong>Indicative Matching</strong> tab to emit a bid or match an issuance.
        </div>
      ) : (
        <div className="grid-cards">
          {vaults.map((vault) => (
            <VaultCard
              key={vault.vaultId}
              vault={vault}
              userPosition={userPositions[vault.vaultId] || null}
              onRefresh={loadData}
            />
          ))}
        </div>
      )}
    </div>
  )
}
