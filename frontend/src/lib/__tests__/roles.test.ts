import { describe, it, expect } from 'vitest'
import { canAccessTab, canLend, canIssue, TAB_ORDER } from '@/lib/roles'

describe('role-based tab access', () => {
  it('a borrower can issue and see positions, but not lend or open the broker hub', () => {
    expect(canAccessTab('borrower', 'issue')).toBe(true)
    expect(canAccessTab('borrower', 'positions')).toBe(true)
    expect(canAccessTab('borrower', 'broker')).toBe(false)
    expect(canLend('borrower')).toBe(false)
    expect(canIssue('borrower')).toBe(true)
  })

  it('a lender can fund and see positions, but not issue or open the broker hub', () => {
    expect(canAccessTab('lender', 'issue')).toBe(false)
    expect(canAccessTab('lender', 'positions')).toBe(true)
    expect(canAccessTab('lender', 'broker')).toBe(false)
    expect(canLend('lender')).toBe(true)
    expect(canIssue('lender')).toBe(false)
  })

  it('only the broker opens the broker hub, and the broker neither issues nor lends', () => {
    expect(canAccessTab('broker', 'broker')).toBe(true)
    expect(canAccessTab('broker', 'issue')).toBe(false)
    expect(canAccessTab('broker', 'positions')).toBe(false)
    expect(canLend('broker')).toBe(false)
    expect(canIssue('broker')).toBe(false)
  })

  it('an account with no role yet only gets the read-only screens', () => {
    for (const role of [undefined, 'unassigned'] as const) {
      expect(canAccessTab(role, 'orderbook')).toBe(true)
      expect(canAccessTab(role, 'finance')).toBe(true)
      expect(canAccessTab(role, 'issue')).toBe(false)
      expect(canAccessTab(role, 'positions')).toBe(false)
      expect(canAccessTab(role, 'broker')).toBe(false)
    }
  })

  it('every tab in the navbar order has an access rule', () => {
    for (const t of TAB_ORDER) expect(typeof canAccessTab('broker', t.id)).toBe('boolean')
  })
})
