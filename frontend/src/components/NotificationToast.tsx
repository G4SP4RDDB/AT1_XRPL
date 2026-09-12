import { useState } from 'react'
import type { FC } from 'react'
import { useNotifications, type TxNotification } from '@/lib/notifications'

const NotificationItem: FC<{ notif: TxNotification; onDismiss: (id: string) => void }> = ({
  notif,
  onDismiss,
}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!notif.txHash) return
    try {
      await navigator.clipboard.writeText(notif.txHash)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore clipboard error
    }
  }

  const isSuccess = notif.type === 'success'
  const isError = notif.type === 'error'

  const borderLeftColor = isSuccess ? '#10b981' : isError ? '#ef4444' : '#3b82f6'
  const icon = isSuccess ? '✅' : isError ? '❌' : 'ℹ️'

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderLeft: `4px solid ${borderLeftColor}`,
        borderRadius: '12px',
        padding: '1rem 1.1rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        minWidth: '320px',
        maxWidth: '440px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem', lineHeight: 1 }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            {notif.title}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(notif.id)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '1.2rem',
            lineHeight: 1,
            padding: '0 4px',
          }}
          aria-label="Fermer"
        >
          ×
        </button>
      </div>

      {/* Message */}
      {notif.message && (
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          {notif.message}
        </p>
      )}

      {/* Tx Hash Row */}
      {notif.txHash && (
        <div
          style={{
            marginTop: '0.35rem',
            padding: '0.45rem 0.65rem',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>TX HASH :</span>
            <span
              style={{
                fontFamily: 'monospace',
                color: 'var(--accent-blue)',
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
              title={notif.txHash}
            >
              {notif.txHash.slice(0, 10)}...{notif.txHash.slice(-8)}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.1rem' }}>
            <button
              type="button"
              onClick={handleCopy}
              className="btn btn-secondary btn-sm"
              style={{
                fontSize: '0.74rem',
                padding: '0.2rem 0.55rem',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                flex: 1,
                justifyContent: 'center',
              }}
            >
              {copied ? '✓ Copié !' : '📋 Copier le Hash'}
            </button>

            {notif.explorerUrl && (
              <a
                href={notif.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm"
                style={{
                  fontSize: '0.74rem',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  flex: 1,
                  justifyContent: 'center',
                  textDecoration: 'none',
                  background: 'var(--accent-green)',
                  borderColor: 'var(--accent-green)',
                }}
              >
                <span>Explorer</span>
                <span>↗</span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export const NotificationToastContainer: FC = () => {
  const { notifications, dismiss } = useNotifications()

  if (notifications.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        pointerEvents: 'auto',
      }}
    >
      {notifications.map((notif) => (
        <NotificationItem key={notif.id} notif={notif} onDismiss={dismiss} />
      ))}
    </div>
  )
}
