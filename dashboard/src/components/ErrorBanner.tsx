import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function ErrorBanner({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div
      className="card flex items-center gap-3 px-5 py-4"
      style={{ boxShadow: 'inset 0 0 0 1px rgba(255, 180, 171, 0.25)' }}
    >
      <AlertTriangle size={18} style={{ color: 'var(--color-error)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--color-error)' }}>
          Failed to load data
        </p>
        {message && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-on-surface-variant)' }}>
            {message}
          </p>
        )}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn-ghost text-xs">
          <RefreshCw size={13} /> Retry
        </button>
      )}
    </div>
  )
}
