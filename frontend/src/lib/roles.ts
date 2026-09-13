// Role-based access for the UI. The ledger and the chain shim enforce the real rules (who can
// sign what); this only decides which screens and actions a connected account is offered.
// Everyone can browse every screen; only the platform broker gets the Broker Hub. Actions are
// gated separately: issuers post bonds, investors bid on and fund tranches.
export type AppTab = 'issue' | 'finance' | 'positions' | 'orderbook' | 'broker'
export type AccountRole = 'borrower' | 'lender' | 'broker' | 'unassigned'

export function canAccessTab(role: AccountRole | undefined, tab: AppTab): boolean {
  if (tab === 'broker') return role === 'broker'
  return true
}

export const TAB_ORDER: ReadonlyArray<{ id: AppTab; label: string }> = [
  { id: 'orderbook', label: 'Order Book' },
  { id: 'finance', label: 'Finance Bonds' },
  { id: 'issue', label: 'Issue Bond' },
  { id: 'positions', label: 'My Positions' },
  { id: 'broker', label: '🏛️ Broker Hub' },
]

/** Only investor (lender) accounts may bid on and fund a tranche. */
export const canLend = (role: AccountRole | undefined): boolean => role === 'lender'
/** Only issuer (borrower) accounts may post a bond / tranche. */
export const canIssue = (role: AccountRole | undefined): boolean => role === 'borrower'
