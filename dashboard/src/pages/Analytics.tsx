import { useQuery } from '@tanstack/react-query'
import { fetchStalenessHeatmap, fetchHighRisk, fetchHealthScore, fetchMemoryStats, fetchValidations } from '../api/client'
import TrustScoreBadge from '../components/TrustScoreBadge'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts'
import ErrorBanner from '../components/ErrorBanner'
import { TrendingUp, Activity, Database } from 'lucide-react'
import { titleCase, formatRelative } from '../utils/time'

/* ─── color constants matching Obsidian Intelligence tokens ─── */
const C = {
  primary: '#adc6ff',
  primaryBright: '#367ef2',
  secondary: '#4edea3',
  tertiary: '#ffb95f',
  error: '#ffb4ab',
  onSurface: '#dae2fd',
  onSurfaceVariant: '#c5c6cd',
  surfaceContainer: '#171f33',
  surfaceHigh: '#222a3d',
  surfaceHighest: '#2d3449',
  background: '#0b1326',
}

export default function Analytics() {
  const health = useQuery({ queryKey: ['health-score'], queryFn: fetchHealthScore })
  const stats = useQuery({ queryKey: ['memory-stats'], queryFn: fetchMemoryStats })
  const heatmap = useQuery({ queryKey: ['staleness-heatmap'], queryFn: fetchStalenessHeatmap })
  const risk = useQuery({ queryKey: ['high-risk'], queryFn: fetchHighRisk })
  const jobs = useQuery({ queryKey: ['validations-all'], queryFn: () => fetchValidations({ limit: '30' }) })

  const h = health.data
  const s = stats.data

  /* Build trust distribution buckets from fact_type data */
  const trustDistribution = buildTrustDistribution(s)

  /* Build telemetry timeline from validation jobs */
  const telemetry = buildTelemetryData(jobs.data)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-headline text-2xl font-bold" style={{ color: C.onSurface }}>
          Analytics
        </h1>
        <p className="mt-1 text-sm" style={{ color: C.onSurfaceVariant }}>
          Memory health insights and staleness patterns
        </p>
      </div>

      {(health.isError || stats.isError || heatmap.isError || risk.isError) && (
        <ErrorBanner
          message="Failed to load analytics data"
          onRetry={() => { health.refetch(); stats.refetch(); heatmap.refetch(); risk.refetch() }}
        />
      )}

      {/* ─── Large stat cards row ─── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BigStat
          icon={<TrendingUp size={18} />}
          label="Avg Trust Score"
          value={h ? `${Math.round(h.avg_trust_score * 100)}%` : '--'}
          color={C.secondary}
        />
        <BigStat
          icon={<Activity size={18} />}
          label="Staleness Rate"
          value={heatmap.data ? `${computeOverallStaleness(heatmap.data)}%` : '--'}
          color={C.tertiary}
        />
        <BigStat
          icon={<Database size={18} />}
          label="Total Memories"
          value={s ? String(s.total) : '--'}
          color={C.primary}
        />
      </div>

      {/* ─── Trust Distribution Bar Chart + Staleness Heatmap ─── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Trust Score Distribution */}
        <div
          className="lg:col-span-7 rounded-xl"
          style={{ backgroundColor: C.surfaceContainer, boxShadow: 'var(--shadow-ambient)' }}
        >
          <div className="px-5 py-3 rounded-t-xl" style={{ backgroundColor: C.surfaceHigh }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.onSurfaceVariant }}>
              Trust Score Distribution
            </span>
          </div>
          <div className="p-5">
            {trustDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trustDistribution} barCategoryGap="20%">
                  <XAxis
                    dataKey="range"
                    tick={{ fill: C.onSurfaceVariant, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: C.onSurfaceVariant, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: C.surfaceHigh,
                      border: 'none',
                      borderRadius: '8px',
                      color: C.onSurface,
                      fontSize: '12px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    }}
                    cursor={{ fill: 'rgba(173, 198, 255, 0.05)' }}
                  />
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    fill={C.primary}
                    name="Memories"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] items-center justify-center">
                <p className="text-xs" style={{ color: C.onSurfaceVariant }}>No data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Staleness Heatmap Grid */}
        <div
          className="lg:col-span-5 rounded-xl"
          style={{ backgroundColor: C.surfaceContainer, boxShadow: 'var(--shadow-ambient)' }}
        >
          <div className="px-5 py-3 rounded-t-xl" style={{ backgroundColor: C.surfaceHigh }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.onSurfaceVariant }}>
              Staleness Heatmap
            </span>
          </div>
          <div className="p-5">
            {heatmap.data?.length ? (
              <div className="space-y-3">
                {heatmap.data.map((entry) => {
                  const rate = entry.staleness_rate ?? 0
                  return (
                    <div key={entry.fact_type} className="flex items-center gap-3">
                      <span
                        className="w-24 truncate text-xs font-medium"
                        style={{ color: C.onSurfaceVariant }}
                      >
                        {titleCase(entry.fact_type)}
                      </span>
                      <div className="flex-1 flex gap-1">
                        {renderHeatmapBlocks(rate)}
                      </div>
                      <span className="w-10 text-right text-xs font-mono" style={{ color: C.onSurfaceVariant }}>
                        {rate > 0 ? `${Math.round(rate * 100)}%` : '--'}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex h-[180px] items-center justify-center">
                <p className="text-xs" style={{ color: C.onSurfaceVariant }}>Not enough data yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Health Telemetry Line Chart ─── */}
      <div
        className="rounded-xl"
        style={{ backgroundColor: C.surfaceContainer, boxShadow: 'var(--shadow-ambient)' }}
      >
        <div className="px-5 py-3 rounded-t-xl" style={{ backgroundColor: C.surfaceHigh }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.onSurfaceVariant }}>
            Health Telemetry
          </span>
        </div>
        <div className="p-5">
          {telemetry.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={telemetry}>
                <defs>
                  <linearGradient id="telemetryGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.secondary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.secondary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(68, 71, 77, 0.15)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: C.onSurfaceVariant, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: C.onSurfaceVariant, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: C.surfaceHigh,
                    border: 'none',
                    borderRadius: '8px',
                    color: C.onSurface,
                    fontSize: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="validated"
                  stroke={C.secondary}
                  fill="url(#telemetryGrad)"
                  strokeWidth={2}
                  name="Validated"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="flagged"
                  stroke={C.tertiary}
                  fill="none"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  name="Flagged"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[200px] items-center justify-center">
              <p className="text-xs" style={{ color: C.onSurfaceVariant }}>No telemetry data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── High-Risk Memories Table ─── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: C.surfaceContainer, boxShadow: 'var(--shadow-ambient)' }}
      >
        <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: C.surfaceHigh }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.onSurfaceVariant }}>
            High-Risk Memories
          </span>
          <span className="text-[10px] font-normal tracking-normal" style={{ color: C.onSurfaceVariant }}>
            Low trust + high retrieval = highest risk
          </span>
        </div>
        {risk.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: C.surfaceHigh }}>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.onSurfaceVariant }}>Content</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider w-28" style={{ color: C.onSurfaceVariant }}>Type</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider w-20" style={{ color: C.onSurfaceVariant }}>Trust</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider w-20" style={{ color: C.onSurfaceVariant }}>Retrievals</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider w-20" style={{ color: C.onSurfaceVariant }}>Risk</th>
                </tr>
              </thead>
              <tbody>
                {risk.data.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-[#222a3d]">
                    <td className="max-w-sm truncate px-5 py-3" style={{ color: C.onSurface }}>{m.content}</td>
                    <td className="px-5 py-3">
                      <span
                        className="rounded-sm px-2 py-0.5 text-[11px] font-medium"
                        style={{ backgroundColor: C.surfaceHighest, color: C.onSurfaceVariant }}
                      >
                        {titleCase(m.fact_type)}
                      </span>
                    </td>
                    <td className="px-5 py-3"><TrustScoreBadge score={m.trust_score} /></td>
                    <td className="px-5 py-3 text-right font-mono" style={{ color: C.onSurfaceVariant }}>
                      {m.retrieval_count}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className="inline-flex items-center rounded-sm px-2.5 py-1 text-xs font-bold"
                        style={{
                          backgroundColor: 'rgba(255, 180, 171, 0.12)',
                          color: C.error,
                        }}
                      >
                        {m.risk_score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-28 items-center justify-center">
            <p className="text-sm" style={{ color: C.onSurfaceVariant }}>No high-risk memories detected</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Big stat card with Space Grotesk numbers ─── */
function BigStat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div
      className="rounded-xl p-6 flex flex-col gap-3"
      style={{ backgroundColor: C.surfaceContainer, boxShadow: 'var(--shadow-ambient)' }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.onSurfaceVariant }}>
          {label}
        </span>
      </div>
      <span className="font-headline text-4xl font-bold" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

/* ─── Heatmap blocks renderer ─── */
function renderHeatmapBlocks(rate: number) {
  const blockCount = 10
  const filledCount = Math.round(rate * blockCount)
  const blocks = []

  for (let i = 0; i < blockCount; i++) {
    let color: string
    if (i >= filledCount) {
      color = C.surfaceHighest
    } else if (rate <= 0.3) {
      color = C.secondary
    } else if (rate <= 0.6) {
      color = C.tertiary
    } else {
      color = C.error
    }

    blocks.push(
      <div
        key={i}
        className="h-4 flex-1 rounded-sm transition-colors"
        style={{ backgroundColor: color, opacity: i < filledCount ? 1 : 0.3 }}
      />
    )
  }

  return blocks
}

/* ─── Compute overall staleness average ─── */
function computeOverallStaleness(data: { staleness_rate: number | null }[]): string {
  const rates = data.filter((d) => d.staleness_rate != null).map((d) => d.staleness_rate as number)
  if (rates.length === 0) return '0'
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length
  return Math.round(avg * 100).toString()
}

/* ─── Build trust score distribution buckets ─── */
function buildTrustDistribution(s: { total: number; active: number; flagged: number; quarantined: number; invalidated: number; avg_trust_score: number } | undefined) {
  if (!s || s.total === 0) return []

  // Approximate distribution from aggregate data
  const total = s.total
  const highTrust = s.active
  const medTrust = s.flagged
  const lowTrust = s.quarantined + s.invalidated

  return [
    { range: '0-20', count: Math.round(lowTrust * 0.4) },
    { range: '21-40', count: Math.round(lowTrust * 0.6) },
    { range: '41-60', count: Math.round(medTrust * 0.5) },
    { range: '61-80', count: Math.round(medTrust * 0.5 + highTrust * 0.2) },
    { range: '81-100', count: Math.max(0, total - Math.round(lowTrust + medTrust * 0.5 + highTrust * 0.2)) },
  ]
}

/* ─── Build telemetry timeline from validation jobs ─── */
function buildTelemetryData(jobs: { created_at: string; validated_count: number; flagged_count: number }[] | undefined) {
  if (!jobs || jobs.length === 0) return []

  const byDate: Record<string, { validated: number; flagged: number }> = {}
  for (const j of jobs) {
    const date = formatRelative(j.created_at)
    if (!byDate[date]) byDate[date] = { validated: 0, flagged: 0 }
    byDate[date].validated += j.validated_count
    byDate[date].flagged += j.flagged_count
  }

  return Object.entries(byDate).map(([date, data]) => ({ date, ...data }))
}
