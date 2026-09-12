import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'
import { walletManager } from '@/lib/xrplConnect'

describe('App', () => {
  it('renders the header and connect button when disconnected', async () => {
    await act(async () => {
      render(<App />)
    })
    expect(screen.getByText(/AT1 · XRPL/i)).toBeInTheDocument()
    expect(screen.getByText(/Bond Platform/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Connect Wallet/i).length).toBeGreaterThan(0)
  })

  it('triggers connector open on click and reacts to xrpl-connect connect event', async () => {
    await act(async () => {
      render(<App />)
    })

    // Mock open on web component
    const connectorEl = document.getElementById('xrpl-wallet-connector-ui') as any
    let openCalled = false
    if (connectorEl) {
      connectorEl.open = () => {
        openCalled = true
      }
    }

    // Click "Connect Wallet"
    const connectButtons = screen.getAllByText(/Connect Wallet/i)
    await act(async () => {
      fireEvent.click(connectButtons[0])
    })

    expect(openCalled).toBe(true)

    // Simulate walletManager connecting
    await act(async () => {
      ;(walletManager as any).emit('connect', {
        address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        adapterName: 'XRPL Dev Wallet',
      })
    })

    await waitFor(() => {
      expect(screen.getByText(/Disconnect/i)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /Finance Bonds/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Issue Bond/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /My Positions/i })).toBeInTheDocument()
  })
})
