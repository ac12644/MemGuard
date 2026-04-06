interface Props {
  score: number
  label?: string
  size?: 'sm' | 'lg'
}

export default function HealthScore({ score, label = 'Memory Health', size = 'lg' }: Props) {
  const pct = Math.round(score * 100)
  const isLg = size === 'lg'
  const r = isLg ? 58 : 28
  const circumference = 2 * Math.PI * r
  const offset = circumference - (pct / 100) * circumference
  const svgSize = isLg ? 148 : 68
  const strokeW = isLg ? 10 : 5

  // Emerald glow for healthy, tertiary for mid, error for low
  const ringColor =
    pct >= 70
      ? '#4edea3'
      : pct >= 40
        ? '#ffb95f'
        : '#ffb4ab'

  const glowColor =
    pct >= 70
      ? 'drop-shadow(0 0 12px rgba(78, 222, 163, 0.5)) drop-shadow(0 0 32px rgba(78, 222, 163, 0.2))'
      : pct >= 40
        ? 'drop-shadow(0 0 12px rgba(255, 185, 95, 0.4)) drop-shadow(0 0 32px rgba(255, 185, 95, 0.15))'
        : 'drop-shadow(0 0 12px rgba(255, 180, 171, 0.4)) drop-shadow(0 0 32px rgba(255, 180, 171, 0.15))'

  const gradientId = `gauge-${size}-${pct}`

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ filter: glowColor }}>
        <svg width={svgSize} height={svgSize} className="-rotate-90">
          {/* Background track */}
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={r}
            fill="none"
            stroke="rgba(34, 42, 61, 0.8)"
            strokeWidth={strokeW}
          />
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={ringColor} />
              <stop offset="100%" stopColor={ringColor} stopOpacity="0.6" />
            </linearGradient>
          </defs>
          {/* Active arc */}
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={r}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeW}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="animate-gauge"
            style={
              { '--circumference': circumference, '--offset': offset } as React.CSSProperties
            }
          />
        </svg>
        {/* Center number */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-headline font-bold ${isLg ? 'text-4xl' : 'text-lg'}`}
            style={{ color: ringColor }}
          >
            {pct}
          </span>
          {isLg && (
            <span className="text-[11px] font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
              / 100
            </span>
          )}
        </div>
      </div>
      <span
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--color-on-surface-variant)' }}
      >
        {label}
      </span>
    </div>
  )
}
