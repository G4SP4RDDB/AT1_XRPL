import { useState, useEffect } from 'react'
import type { FC } from 'react'
import type { VaultState, UserPosition } from '@shared/types'
import { useWallet } from '@/lib/wallet'
import { mockChainClient } from '@/lib/chainClient'
import { WithdrawModal } from './WithdrawModal'
import { CouponModal } from './CouponModal'
import { MultisigRepayModal } from './MultisigRepayModal'

export const MyPositions: FC = () => {
  const { currentAccount } = useWallet()
  const [vaults, setVaults] = useState<VaultState[]>([])
  const [positions, setPositions] = useState<Record<string, UserPosition>>({})
  const [selectedVaultForWithdraw, setSelectedVaultForWithdraw] = useState<VaultState | null>(null)
  const [selectedVaultForCoupon, setSelectedVaultForCoupon] = useState<VaultState | null>(null)
  const [selectedVaultForRepay, setSelectedVaultForRepay] = useState<VaultState | null>(null)

  const loadData = async () => {
    if (!currentAccount) return
    const allVaults = await mockChainClient.getAllVaults()
    setVaults(allVaults)

    const posMap: Record<string, UserPosition> = {}
    for (const v of allVaults) {
      const pos = await mockChainClient.getUserPosition(currentAccount.address, v.vaultId)
      if (pos) posMap[v.vaultId] = pos
    }
    setPositions(posMap)
  }

  useEffect(() => {
    loadData()
  }, [currentAccount?.address])

  if (!currentAccount) return null

  // Vaults relevant to this account
  const investedVaults = vaults.filter((v) => positions[v.vaultId] && Number(positions[v.vaultId].sharesOwned) > 0)
  const issuedVaults = vaults.filter((v) => v.borrowerAddress === currentAccount.address)

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="section-header">
        <div>
          <h3 className="section-title">My Bonds & Positions</h3>
          <p className="section-subtitle">
            Manage your bond investments, coupon payments, and redemptions
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadData}>
          Refresh
        </button>
      </div>

      {/* Section Investissements */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--accent-cyan)' }}>
          💼 My Investments ({investedVaults.length})
        </h4>

        {investedVaults.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            You have not funded any bonds yet. Navigate to the <strong>Finance Bonds</strong> tab to allocate capital.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {investedVaults.map((vault) => {
              const pos = positions[vault.vaultId]
              return (
                <div key={vault.vaultId} className="card">
                  <div className="card-header">
                    <div>
                      <h5 className="card-title" style={{ fontSize: '1.05rem' }}>{vault.vaultId}</h5>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Call Date: {vault.callDate}
                      </span>
                    </div>
                    <span className="card-tag tag-active">PPS: {vault.pps.toFixed(4)}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', background: 'var(--bg-surface-elevated)', padding: '1rem 1.1rem', borderRadius: '10px', border: '1px solid var(--border-subtle)', margin: '0.9rem 0' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Principal Deposited</div>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', marginTop: '0.15rem', color: 'var(--text-primary)' }}>{Number(pos.principalDeposited).toLocaleString()} XRP</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current Value</div>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', marginTop: '0.15rem', color: 'var(--text-primary)' }}>{Number(pos.currentValue).toLocaleString()} XRP</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Accrued Yield</div>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', marginTop: '0.15rem', color: 'var(--accent-green)' }}>+{Number(pos.accruedYield).toLocaleString()} XRP</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => setSelectedVaultForWithdraw(vault)}
                    >
                      Withdraw Yield / Test Guardrail
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Section Obligations Émises (Emprunteur) */}
      <div>
        <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--accent-blue)' }}>
          🏛️ My Issued Bonds ({issuedVaults.length})
        </h4>

        {issuedVaults.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            No bonds issued with this address.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {issuedVaults.map((vault) => (
              <div key={vault.vaultId} className="card">
                <div className="card-header">
                  <div>
                    <h5 className="card-title" style={{ fontSize: '1.05rem' }}>{vault.vaultId}</h5>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Coupon Rate: {vault.loanInterestRate}% | Call: {vault.callDate}
                    </span>
                  </div>
                  <span className={`card-tag ${vault.loanStatus === 'repaid' ? 'tag-active' : 'tag-locked'}`}>
                    {vault.loanStatus === 'repaid' ? 'Repaid' : 'Active (Locked)'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', background: 'var(--bg-surface-elevated)', padding: '1rem 1.1rem', borderRadius: '10px', border: '1px solid var(--border-subtle)', margin: '0.9rem 0' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Principal Owed</div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', marginTop: '0.15rem', color: 'var(--text-primary)' }}>{Number(vault.loanPrincipal).toLocaleString()} XRP</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Liquid Assets in Vault</div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', marginTop: '0.15rem', color: 'var(--accent-cyan)' }}>{Number(vault.liquidAssets).toLocaleString()} XRP</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => setSelectedVaultForCoupon(vault)}
                  >
                    Pay Coupon (LoanPay)
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => setSelectedVaultForRepay(vault)}
                  >
                    Final Repayment (Multisig)
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals d'action */}
      {selectedVaultForWithdraw && (
        <WithdrawModal
          vault={selectedVaultForWithdraw}
          position={positions[selectedVaultForWithdraw.vaultId] || null}
          onClose={() => setSelectedVaultForWithdraw(null)}
          onSuccess={() => {
            loadData()
          }}
        />
      )}

      {selectedVaultForCoupon && (
        <CouponModal
          vault={selectedVaultForCoupon}
          onClose={() => setSelectedVaultForCoupon(null)}
          onSuccess={() => {
            loadData()
          }}
        />
      )}

      {selectedVaultForRepay && (
        <MultisigRepayModal
          vault={selectedVaultForRepay}
          onClose={() => setSelectedVaultForRepay(null)}
          onSuccess={() => {
            loadData()
          }}
        />
      )}
    </div>
  )
}
