import { describe, it, expect } from 'vitest'
import { canAccessTab, canLend, canIssue, TAB_ORDER } from '@/lib/roles'

describe('role-based access', () => {
  it('everyone can browse every screen except the broker hub', () => {
    for (const role of ['borrower', 'lender', 'unassigned', undefined] as const) {
      for (const t of TAB_ORDER) {
        expect(canAccessTab(role, t.id)).toBe(t.id !== 'broker')
      }
    }
  })

  it('only the broker opens the broker hub', () => {
    expect(canAccessTab('broker', 'broker')).toBe(true)
    expect(canAccessTab('borrower', 'broker')).toBe(false)
    expect(canAccessTab('lender', 'broker')).toBe(false)
  })

  it('only issuers post bonds, only investors fund them', () => {
    expect(canIssue('borrower')).toBe(true)
    expect(canIssue('lender')).toBe(false)
    expect(canIssue('broker')).toBe(false)
    expect(canLend('lender')).toBe(true)
    expect(canLend('borrower')).toBe(false)
    expect(canLend('broker')).toBe(false)
    expect(canLend(undefined)).toBe(false)
    expect(canIssue(undefined)).toBe(false)
  })
})
