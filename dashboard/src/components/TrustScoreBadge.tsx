interface Props {
  score: number
  showValue?: boolean
  size?: 'sm' | 'md'
}

/**
 * Inked trust meter: a ruled track with a solid ink fill and a
 * mono numeral. Color shifts with the verdict band.
 */
export default function TrustScoreBadge({ score, showValue = true, size = 'sm' }: Props) {
  const pct = Math.round(score * 100)

  const barColor =
    pct >= 70 ? 'bg-ledger-secondary' : pct >= 50 ? 'bg-ledger-tertiary' : 'bg-ledger-error'
  const textColor =
    pct >= 70 ? 'text-ledger-secondary' : pct >= 50 ? 'text-ledger-tertiary' : 'text-ledger-error'

  const trackClass = size === 'md' ? 'h-[7px] w-20' : 'h-[5px] w-14'

  return (
    <div className="inline-flex items-center gap-2">
      <div
        className={`${trackClass} relative overflow-hidden rounded-full border border-ledger-outline-variant bg-ledger-surface-lowest`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showValue && (
        <span className={`mono text-xs font-semibold tabular-nums ${textColor}`}>{pct}%</span>
      )}
    </div>
  )
}
