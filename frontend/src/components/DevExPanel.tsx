import { useState } from 'react'
import type { FC } from 'react'

export const DevExPanel: FC = () => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="devex-box">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="devex-title">
          <span>🛠️</span>
          <span>XRPL Lending Protocol Hackathon — Developer Experience & Protocol Friction Analysis (40% Weight)</span>
        </div>
        <button className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.6rem' }}>
          {isOpen ? 'Collapse Feedback' : 'View Protocol Feedback'}
        </button>
      </div>

      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
        Track 1 (Open-Ended Vault, XLS-65/66 V1) | Custom Hackathon Devnet | xrpl.js
      </p>

      {isOpen && (
        <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
          <div style={{ background: 'var(--bg-surface-elevated)', padding: '1.1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', borderLeft: '4px solid var(--accent-amber)' }}>
            <h4 style={{ color: '#b45309', fontWeight: 700, marginBottom: '0.3rem' }}>
              1. Multisig Repayment Gate vs. Native Time Gating (Critical Finding)
            </h4>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              <strong>Friction:</strong> To guarantee that an issuing borrower cannot repay principal early (which would make principal liquid before the call date), our architecture gates the final <code>LoanPay</code> via an N-of-M multisig. However, XRPL multisig (<code>SignerListSet</code>) has no native temporal execution conditions—it only validates <em>who</em> signs, not <em>when</em>. Enforcing the call date is therefore an off-chain policy or bot scheduling assumption.
            </p>
            <p style={{ color: '#047857' }}>
              <strong>Proposed Hardening (XLS-85 / TokenEscrow):</strong> Compose the multisig repayment with native <code>TokenEscrow</code> primitives featuring <code>FinishAfter</code> conditions. This transforms the off-chain signer policy into an unforgeable, on-chain time lock.
            </p>
          </div>

          <div style={{ background: 'var(--bg-surface-elevated)', padding: '1.1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', borderLeft: '4px solid var(--accent-blue)' }}>
            <h4 style={{ color: '#1d4ed8', fontWeight: 700, marginBottom: '0.3rem' }}>
              2. Passive Yield Accrual vs. Application-Layer Sizing
            </h4>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              <strong>Friction:</strong> In XLS-65/66, coupon repayments raise <code>AssetsTotal</code>, increasing the Price Per Share (PPS). While this cleanly tracks yield, there is no native "yield-only dividend claim" transaction. To pull yield, the client must manually compute:
              <br />
              <code style={{ background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', margin: '4px 0', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
                SharesToRedeem = (CurrentVal - Principal) / PPS
              </code>
            </p>
            <p style={{ color: '#047857' }}>
              <strong>Proposed Native Enhancement:</strong> Add an optional <code>YieldOnly: true</code> flag or NAV-delta parameter to <code>VaultWithdraw</code> so the XRPL ledger computes and burns only the profit-margin shares atomically.
            </p>
          </div>

          <div style={{ background: 'var(--bg-surface-elevated)', padding: '1.1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', borderLeft: '4px solid var(--accent-green)' }}>
            <h4 style={{ color: '#047857', fontWeight: 700, marginBottom: '0.3rem' }}>
              3. Guardrail Demonstration: Native Vault Illiquidity
            </h4>
            <p style={{ color: 'var(--text-secondary)' }}>
              <strong>Observed Guardrail:</strong> When capital is drawn down by the borrower via <code>LoanDraw</code>, the vault holds 0 liquid XRP. When a depositor submits a full <code>VaultWithdraw</code> prior to loan repayment, the ledger cleanly enforces safety by rejecting the transaction with <code>tecINSUFFICIENT_FUNDS</code> / vault illiquidity. This verifies Minimum Bar item 6.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
