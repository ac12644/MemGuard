interface Props {
  score: number
  label?: string
  size?: 'sm' | 'lg'
}

/**
 * Ink-drawn health gauge: hairline track, solid ink arc,
 * Fraunces numeral at center. No glow — precision, not neon.
 */
export default function HealthScore({ score, label = 'Memory Health', size = 'lg' }: Props) {
  const pct = Math.round(score * 100)
  const isLg = size === 'lg'
  const r = isLg ? 58 : 28
  const circumference = 2 * Math.PI * r
  const offset = circumference - (pct / 100) * circumference
  const svgSize = isLg ? 148 : 68
  const strokeW = isLg ? 8 : 4

  const ringColor = pct >= 70 ? '#1e7a4c' : pct >= 40 ? '#a66102' : '#a8322d'

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <svg width={svgSize} height={svgSize} className="-rotate-90">
          {/* Hairline track */}
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={r}
            fill="none"
            stroke="rgba(29, 27, 20, 0.1)"
            strokeWidth={1}
          />
          {/* Dotted reference ring */}
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={r + strokeW / 2 + 3}
            fill="none"
            stroke="rgba(29, 27, 20, 0.08)"
            strokeWidth={1}
            strokeDasharray="1 4"
          />
          {/* Ink arc */}
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth={strokeW}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="butt"
            className="animate-gauge"
            style={{ '--circumference': circumference, '--offset': offset } as React.CSSProperties}
          />
        </svg>
        {/* Center numeral */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-headline font-semibold tabular-nums ${isLg ? 'text-[2.6rem] leading-none' : 'text-lg'}`}
            style={{ color: ringColor }}
          >
            {pct}
          </span>
          {isLg && <span className="mono mt-1 text-[10px] text-ledger-outline">/ 100</span>}
        </div>
      </div>
      <span className="ledger-no">{label}</span>
    </div>
  )
}
