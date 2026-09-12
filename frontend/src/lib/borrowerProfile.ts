import { useState, useEffect } from 'react'

export interface BorrowerProfile {
  firstName: string
  role: string
  company: string
  address: string
  multisigActive: boolean
  configuredAt: string
}

const PROFILE_EVENT = 'at1_borrower_profile_updated'

export function getStoredBorrowerProfile(address?: string): BorrowerProfile | null {
  if (!address) return null
  try {
    const raw = localStorage.getItem(`at1_borrower_profile_${address}`)
    return raw ? (JSON.parse(raw) as BorrowerProfile) : null
  } catch {
    return null
  }
}

export function saveStoredBorrowerProfile(profile: BorrowerProfile): void {
  localStorage.setItem(`at1_borrower_profile_${profile.address}`, JSON.stringify(profile))
  localStorage.setItem('at1_current_borrower_profile', JSON.stringify(profile))
  window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: profile }))
}

export function useBorrowerProfile(address?: string) {
  const [profile, setProfile] = useState<BorrowerProfile | null>(() => getStoredBorrowerProfile(address))

  useEffect(() => {
    setProfile(getStoredBorrowerProfile(address))

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<BorrowerProfile>).detail
      if (detail && (!address || detail.address === address)) {
        setProfile(detail)
      }
    }

    window.addEventListener(PROFILE_EVENT, handler)
    return () => window.removeEventListener(PROFILE_EVENT, handler)
  }, [address])

  return profile
}
