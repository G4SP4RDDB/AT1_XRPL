import { useEffect, useState } from 'react'
import type { FC, FormEvent } from 'react'
import type { BankProfile } from '@shared/types'
import { getCachedProfile, saveProfile } from '@/lib/bankProfiles'

interface BankProfileModalProps {
  isOpen: boolean
  address: string | null | undefined
  onClose: () => void
  onSaved: (profile: BankProfile) => void
}

export const BankProfileModal: FC<BankProfileModalProps> = ({ isOpen, address, onClose, onSaved }) => {
  const [bankName, setBankName] = useState('')
  const [shortCode, setShortCode] = useState('')
  const [country, setCountry] = useState('')
  const [logoEmoji, setLogoEmoji] = useState('')
  const [rating, setRating] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !address) return
    const existing = getCachedProfile(address)
    setBankName(existing?.bankName ?? '')
    setShortCode(existing?.shortCode ?? '')
    setCountry(existing?.country ?? '')
    setLogoEmoji(existing?.logoEmoji ?? '')
    setRating(existing?.rating ?? '')
    setError(null)
  }, [isOpen, address])

  if (!isOpen || !address) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!bankName.trim()) return
    setIsSubmitting(true)
    setError(null)

    try {
      const profile = await saveProfile({
        address,
        bankName: bankName.trim(),
        shortCode: shortCode.trim() || undefined,
        country: country.trim() || undefined,
        logoEmoji: logoEmoji.trim() || undefined,
        rating: rating.trim() || undefined,
      })
      onSaved(profile)
    } catch (err: any) {
      setError(err.message || 'Failed to save bank profile')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '460px', padding: '2rem', borderRadius: '16px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h3 className="card-title" style={{ fontSize: '1.2rem', margin: 0 }}>
              Complete Your Bank Profile
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Shown across the platform instead of your raw address
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Bank / Institution Name</label>
            <input
              type="text"
              className="form-input"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. Nordic Capital Bank"
              required
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Short Code (optional)</label>
              <input
                type="text"
                className="form-input"
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value)}
                placeholder="e.g. NCB"
                maxLength={12}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Country (optional)</label>
              <input
                type="text"
                className="form-input"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Sweden"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Logo Emoji (optional)</label>
              <input
                type="text"
                className="form-input"
                value={logoEmoji}
                onChange={(e) => setLogoEmoji(e.target.value)}
                placeholder="🏦"
                maxLength={4}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Credit Rating (optional)</label>
              <input
                type="text"
                className="form-input"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                placeholder="e.g. A+"
                maxLength={4}
              />
            </div>
          </div>

          <div className="alert alert-info" style={{ fontSize: '0.8rem' }}>
            Off-chain metadata only — this never touches the ledger. Anyone can see this name
            wherever your address appears in the app.
          </div>

          {error && (
            <div className="alert alert-danger" style={{ marginTop: '0.75rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={isSubmitting || !bankName.trim()}
            >
              {isSubmitting ? 'Saving...' : 'Save Bank Profile'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Skip for now
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
