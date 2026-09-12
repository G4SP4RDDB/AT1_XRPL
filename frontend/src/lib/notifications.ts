import { useState, useEffect } from 'react'
import { explorerTxUrl } from './xrpl'

export interface TxNotification {
  id: string
  title: string
  message?: string
  txHash?: string
  type: 'success' | 'error' | 'info'
  timestamp: number
  explorerUrl?: string
}

type Listener = (notifs: TxNotification[]) => void
let notifications: TxNotification[] = []
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((fn) => fn([...notifications]))
}

export function notifyTx(options: {
  title: string
  message?: string
  txHash?: string
  type?: 'success' | 'error' | 'info'
  durationMs?: number
}): string {
  const id = `tx-notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const notif: TxNotification = {
    id,
    title: options.title,
    message: options.message,
    txHash: options.txHash,
    type: options.type ?? 'success',
    timestamp: Date.now(),
    explorerUrl: options.txHash ? explorerTxUrl(options.txHash) : undefined,
  }

  // Keep up to 4 active notifications, newest first
  notifications = [notif, ...notifications].slice(0, 4)
  emit()

  const duration = options.durationMs ?? 12000 // 12 seconds default so user has plenty of time to view/copy
  if (duration > 0) {
    setTimeout(() => {
      dismissNotification(id)
    }, duration)
  }

  return id
}

export function dismissNotification(id: string) {
  notifications = notifications.filter((n) => n.id !== id)
  emit()
}

export function useNotifications() {
  const [items, setItems] = useState<TxNotification[]>([...notifications])

  useEffect(() => {
    listeners.add(setItems)
    return () => {
      listeners.delete(setItems)
    }
  }, [])

  return {
    notifications: items,
    dismiss: dismissNotification,
  }
}
