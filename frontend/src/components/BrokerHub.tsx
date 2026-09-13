import { useState, useEffect } from 'react'
import type { FC } from 'react'
import type { VaultState, DbAccount } from '@/lib/chainClient'
import { chainClient } from '@/lib/chainClient'
import { useWallet } from '@/lib/wallet'
import { explorerAccountUrl } from '@/lib/xrpl'
import { notifyTx } from '@/lib/notifications'

export const BrokerHub: FC = () => {
  const { currentAccount } = useWallet()
  const [vaults, setVaults] = useState<VaultState[]>([])
  const [accounts, setAccounts] = useState<DbAccount[]>([])
  const [brokerAddress, setBrokerAddress] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [coverAmounts, setCoverAmounts] = useState<Record<string, string>>({})

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [allVaults, allAccounts, brokerData] = await Promise.all([
        chainClient.getAllVaults(),
        chainClient.listAccounts(),
        chainClient.getRoles(),
      ])
      setVaults(allVaults || [])
      setAccounts(allAccounts || [])
      setBrokerAddress(brokerData.broker || '')
    } catch (err) {
      console.warn('Error loading broker data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleImpair = async (vaultId: string) => {
    setActionLoading(`impair-${vaultId}`)
    try {
      const res = await chainClient.impair(vaultId)
      if (!res.success) {
        notifyTx({
          title: 'Information Protocole XLS-66 (fixCleanup3_4_0)',
          message: `Le ledger a renvoyé : ${res.error || 'tecTOO_SOON'}. Le write-down nécessite un retard de coupon sur ce devnet.`,
          type: 'info',
        })
      }
      await loadData()
    } catch (err: any) {
      notifyTx({
        title: 'Erreur Impair',
        message: err.message,
        type: 'error',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleUnimpair = async (vaultId: string) => {
    setActionLoading(`unimpair-${vaultId}`)
    try {
      const res = await chainClient.unimpair(vaultId)
      if (!res.success) {
        notifyTx({
          title: 'Information Protocole XLS-66',
          message: `Résultat ledger : ${res.error || 'tecNO_PERMISSION'}.`,
          type: 'info',
        })
      }
      await loadData()
    } catch (err: any) {
      notifyTx({
        title: 'Erreur Unimpair',
        message: err.message,
        type: 'error',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleDepositCover = async (vaultId: string, loanBrokerId?: string) => {
    const amount = coverAmounts[vaultId]
    if (!amount || Number(amount) <= 0) {
      notifyTx({
        title: 'Montant invalide',
        message: 'Veuillez saisir un montant de First-Loss Cover supérieur à 0 XRP.',
        type: 'error',
      })
      return
    }

    const targetBrokerId = loanBrokerId || vaultId
    setActionLoading(`cover-${vaultId}`)
    try {
      await chainClient.depositCover(targetBrokerId, amount)
      setCoverAmounts((prev) => ({ ...prev, [vaultId]: '' }))
      await loadData()
    } catch (err: any) {
      notifyTx({
        title: 'Erreur Dépôt de Couverture',
        message: err.message,
        type: 'error',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const borrowers = accounts.filter((a) => a.role === 'borrower')
  const lenders = accounts.filter((a) => a.role === 'lender')

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* HEADER BANNER */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', color: '#fff', border: 'none', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.12)', padding: '4px 12px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              <span>🏛️ XLS-66 Loan Broker Hub</span>
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: '#fff' }}>
              Espace Courtage, Structuration & Risque
            </h2>
            <p style={{ margin: 0, fontSize: '0.92rem', color: '#c7d2fe', maxWidth: '650px', lineHeight: 1.5 }}>
              Le Courtier (<strong>Broker</strong>) structure le prêt, dépose le <strong>First-Loss Capital</strong> pour absorber les premières pertes, et supervise la solvabilité prudentielle (CET1) des émetteurs.
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#a5b4fc', textTransform: 'uppercase', fontWeight: 600 }}>Adresse On-Chain du Broker</div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', background: 'rgba(0, 0, 0, 0.25)', padding: '6px 12px', borderRadius: '8px', marginTop: '4px' }}>
              {brokerAddress || currentAccount?.address || 'Non connectée'}
            </div>
            {brokerAddress && (
              <a
                href={explorerAccountUrl(brokerAddress)}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '0.72rem', color: '#93c5fd', textDecoration: 'none', marginTop: '4px', display: 'inline-block' }}
              >
                Explorer Devnet &rarr;
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ROLES STATS: borrowers and lenders */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #2563eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>🏢 EMPRUNTEURS (BORROWERS)</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-blue)' }}>{borrowers.length}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Émettent les obligations AT1, signent l'emprunt (2-of-2 multisig) et payent les coupons périodiques.
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>💰 PRÊTEURS (LENDERS)</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-green)' }}>{lenders.length}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Déposent dans les coffres, détiennent les parts MPT et retirent le rendement (yield) à discrétion.
          </div>
        </div>
      </div>

      {/* ACTIVE VAULTS UNDER BROKERAGE */}
      <div className="card" style={{ padding: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
              Coffres Obligataires sous Courtage ({vaults.length})
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Gestion des réserves de couverture (First-Loss Cover) et pilotage prudentiel des dépréciations CET1.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadData}
            disabled={isLoading}
          >
            {isLoading ? 'Rafraîchissement...' : '🔄 Actualiser'}
          </button>
        </div>

        {vaults.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-surface-elevated)', borderRadius: '10px' }}>
            Aucun coffre actif actuellement. Émettez une obligation depuis l'onglet <strong>Issue Bond</strong> pour initialiser un coffre.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {vaults.map((vault) => {
              const isImpaired = vault.loanStatus === 'impaired' || Number(vault.lossUnrealized) > 0
              const loanId = vault.loan?.loanId

              return (
                <div
                  key={vault.vaultId}
                  style={{
                    padding: '1.25rem',
                    borderRadius: '12px',
                    background: 'var(--bg-surface-elevated)',
                    border: isImpaired ? '1px solid #ef4444' : '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>Coffre #{vault.vaultId.slice(0, 10)}...</span>
                        {isImpaired ? (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '2px 8px', borderRadius: '6px' }}>
                            ⚠️ DÉPRÉCIÉ (CET1 WRITE-DOWN)
                          </span>
                        ) : vault.loanStatus === 'active' ? (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '2px 8px', borderRadius: '6px' }}>
                            ✓ EN COURS (SAIN)
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'rgba(100, 116, 139, 0.15)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '6px' }}>
                            {vault.loanStatus.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                        ID: {vault.vaultId}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Price Per Share (PPS) : <strong style={{ color: isImpaired ? '#ef4444' : '#10b981' }}>{vault.pps.toFixed(5)} XRP</strong>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Actifs Totaux : {Number(vault.assetsTotal).toLocaleString()} XRP
                      </div>
                    </div>
                  </div>

                  {/* METRICS ROW */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', margin: '1rem 0', background: 'var(--bg-card)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Capital Prêté</div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{Number(vault.loanPrincipal).toLocaleString()} XRP</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Coupon Annuel</div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent-green)' }}>{vault.loanInterestRate}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>First-Loss Cover</div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#9333ea' }}>{Number(vault.firstLossCover).toLocaleString()} XRP</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Perte Non Réalisée</div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: Number(vault.lossUnrealized) > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                        {Number(vault.lossUnrealized).toLocaleString()} XRP
                      </div>
                    </div>
                  </div>

                  {/* BROKER ACTIONS */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                    {/* Top up First Loss Capital */}
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>
                        🛡️ Réapprovisionner le First-Loss Capital :
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="number"
                          className="form-input"
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                          placeholder="Montant en XRP..."
                          value={coverAmounts[vault.vaultId] || ''}
                          onChange={(e) => setCoverAmounts({ ...coverAmounts, [vault.vaultId]: e.target.value })}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={actionLoading === `cover-${vault.vaultId}`}
                          onClick={() => handleDepositCover(vault.vaultId)}
                          style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}
                        >
                          {actionLoading === `cover-${vault.vaultId}` ? 'Dépôt...' : 'Déposer Cover'}
                        </button>
                      </div>
                    </div>

                    {/* Stress-Test CET1 (Impair / Unimpair) */}
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>
                        ⚠️ Pilotage Prudentiel CET1 (XLS-66) :
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {!isImpaired ? (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={!loanId || actionLoading === `impair-${vault.vaultId}`}
                            onClick={() => handleImpair(vault.vaultId)}
                            style={{ width: '100%', fontSize: '0.78rem', fontWeight: 600 }}
                            title="Simule un choc de ratio CET1 et déclenche LoanManage tfLoanImpair on-chain"
                          >
                            {actionLoading === `impair-${vault.vaultId}` ? 'Write-Down...' : '⚡ Déclencher Write-Down CET1'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-success btn-sm"
                            disabled={!loanId || actionLoading === `unimpair-${vault.vaultId}`}
                            onClick={() => handleUnimpair(vault.vaultId)}
                            style={{ width: '100%', fontSize: '0.78rem', fontWeight: 600 }}
                            title="Restaure la santé du prêt avec LoanManage tfLoanUnimpair"
                          >
                            {actionLoading === `unimpair-${vault.vaultId}` ? 'Restauration...' : '✓ Rétablir Solvabilité (Unimpair)'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
