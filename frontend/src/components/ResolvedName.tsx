import type { FC } from 'react'
import { useBankName } from '@/lib/bankProfiles'

interface ResolvedNameProps {
  address?: string
  fallback?: string
}

/** Bank name for an address, wrapped as its own component so it can safely call the
 * useBankName hook once per list item (e.g. inside bids.map(...)). */
export const ResolvedName: FC<ResolvedNameProps> = ({ address, fallback }) => {
  const name = useBankName(address, fallback)
  return <>{name}</>
}
