import { useState, useEffect } from 'react'
import type { FC } from 'react'
import type { Bid, Ask } from '@shared/types'
import { mockChainClient } from '@/lib/chainClient'
import { BidForm } from '@/components/BidForm'
import { AskForm } from '@/components/AskForm'
import { MatchBoard } from '@/components/MatchBoard'

export const MarketplacePage: FC = () => {
  const [bids, setBids] = useState<Bid[]>([])
  const [asks, setAsks] = useState<Ask[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refreshData = async () => {
    try {
      const [fetchedBids, fetchedAsks] = await Promise.all([
        mockChainClient.getBids(),
        mockChainClient.getAsks(),
      ])
      setBids(fetchedBids)
      setAsks(fetchedAsks)
    } catch (err) {
      console.error('Failed to load marketplace data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refreshData()
  }, [])

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Indicative AT1 Matching Engine</h2>
          <p className="section-subtitle">
            Zero-friction off-ledger interest alignment. On-chain VaultCreate and VaultDeposit execute atomically upon mutual match.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <BidForm onBidCreated={refreshData} />
        <AskForm bids={bids} onAskCreated={refreshData} />
      </div>

      <div style={{ marginTop: '2rem' }}>
        <div className="section-header">
          <h3 className="section-title" style={{ fontSize: '1.3rem' }}>
            Live Market Discovery Board
          </h3>
        </div>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            Loading market bids and asks...
          </div>
        ) : (
          <MatchBoard bids={bids} asks={asks} onMatchExecuted={refreshData} />
        )}
      </div>
    </div>
  )
}
