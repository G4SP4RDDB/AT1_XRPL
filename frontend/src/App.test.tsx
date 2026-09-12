import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/xrpl', () => ({
  network: { wss: 'wss://mock.test:51233' },
}))

import App from './App'

describe('App', () => {
  it('renders the marketplace heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AT1 Bond Marketplace on XRPL')
  })

  it('shows the configured network endpoint', () => {
    render(<App />)
    expect(screen.getByText('wss://mock.test:51233')).toBeInTheDocument()
  })
})
