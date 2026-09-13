// Role-based access for the UI. The ledger and the chain shim enforce the real rules (who can
// sign what); this only decides which screens and actions a connected account is offered.
export type AppTab = 'issue' | 'finance' | 'positions' | 'orderbook' | 'broker'
export type AccountRole = 'borrower' | 'lender' | 'broker' | 'unassigned'

const TAB_ACCESS: Record<AppTab, ReadonlyArray<Exclude<AccountRole, 'unassigned'>>> = {
  orderbook: ['borrower', 'lender', 'broker'],
  finance: ['borrower', 'lender', 'broker'],
  issue: ['borrower'],
  positions: ['borrower', 'lender'],
  broker: ['broker'],
}

// What an account sees before it has completed onboarding (no role yet): read-only screens.
const PUBLIC_TABS: ReadonlyArray<AppTab> = ['orderbook', 'finance']

export function canAccessTab(role: AccountRole | undefined, tab: AppTab): boolean {
  if (!role || role === 'unassigned') return PUBLIC_TABS.includes(tab)
  return TAB_ACCESS[tab].includes(role)
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
