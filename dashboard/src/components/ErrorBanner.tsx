import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function ErrorBanner({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-ledger-error/30 bg-ledger-error-container/50 px-5 py-3.5">
      <AlertTriangle size={17} className="shrink-0 text-ledger-error" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ledger-error">Failed to load data</p>
        {message && <p className="mt-0.5 text-xs text-ledger-on-surface-variant">{message}</p>}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary px-3 py-1.5 text-xs">
          <RefreshCw size={12} /> Retry
        </button>
      )}
    </div>
  )
}
