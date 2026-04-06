interface Props {
  score: number
  showValue?: boolean
  size?: 'sm' | 'md'
}

export default function TrustScoreBadge({ score, showValue = true, size = 'sm' }: Props) {
  const pct = Math.round(score * 100)

  // Gradient stops: red (0%) -> tertiary/amber (50%) -> secondary/emerald (100%)
  const barColor =
    pct >= 80
      ? 'bg-gradient-to-r from-[#4edea3] to-[#4edea3]'
      : pct >= 50
        ? 'bg-gradient-to-r from-[#ffb95f] to-[#4edea3]'
        : pct >= 30
          ? 'bg-gradient-to-r from-[#ffb4ab] to-[#ffb95f]'
          : 'bg-gradient-to-r from-[#ffb4ab] to-[#ffb4ab]'

  const trackClass = size === 'md' ? 'h-1.5 w-20' : 'h-1 w-14'

  return (
    <div className="inline-flex items-center gap-2">
      <div className={`${trackClass} rounded-full bg-obsidian-surface-highest overflow-hidden`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showValue && (
        <span className="text-xs font-medium tabular-nums text-obsidian-on-surface-variant">
          {pct}%
        </span>
      )}
    </div>
  )
}
