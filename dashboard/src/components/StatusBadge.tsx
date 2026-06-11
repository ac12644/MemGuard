/**
 * Rubber-stamp status mark: mono uppercase, inked border,
 * tinted ground. The ledger's verdict on a record.
 */
type Tone = 'verified' | 'warning' | 'danger' | 'info' | 'neutral'

const toneByStatus: Record<string, Tone> = {
  active: 'verified',
  verified: 'verified',
  completed: 'verified',
  healthy: 'verified',
  restored: 'verified',
  flagged: 'warning',
  degraded: 'warning',
  stale: 'warning',
  running: 'info',
  pending: 'neutral',
  manual: 'neutral',
  cancelled: 'neutral',
  invalidated: 'neutral',
  quarantined: 'danger',
  failed: 'danger',
  contradicted: 'danger',
  source_unavailable: 'danger',
}

const toneStyles: Record<Tone, string> = {
  verified: 'text-ledger-secondary bg-ledger-secondary/[0.07]',
  warning: 'text-ledger-tertiary bg-ledger-tertiary/[0.08]',
  danger: 'text-ledger-error bg-ledger-error-container/70',
  info: 'text-ledger-primary bg-ledger-primary/[0.07]',
  neutral: 'text-ledger-on-surface-variant bg-ledger-surface-high',
}

export default function StatusBadge({ status }: { status: string }) {
  const tone = toneByStatus[status] ?? 'neutral'
  return (
    <span className={`stamp animate-stamp-in ${toneStyles[tone]}`}>
      {status === 'running' && <span className="h-1.5 w-1.5 rounded-full bg-current animate-glow-pulse" />}
      {status.replace(/_/g, ' ')}
    </span>
  )
}
