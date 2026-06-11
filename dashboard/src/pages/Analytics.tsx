import { useQuery } from '@tanstack/react-query'
import { fetchStalenessHeatmap, fetchHighRisk, fetchHealthScore, fetchMemoryStats, fetchValidations } from '../api/client'
import TrustScoreBadge from '../components/TrustScoreBadge'
import PageHeader from '../components/PageHeader'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts'
import ErrorBanner from '../components/ErrorBanner'
import { TrendingUp, Activity, Database } from 'lucide-react'
import { titleCase, formatRelative } from '../utils/time'

/* ─── The Trust Ledger ink palette for charts ─── */
const INK = {
  blue: '#23408e',
  green: '#1e7a4c',
  amber: '#a66102',
  red: '#a8322d',
  muted: '#5c574b',
}

const AXIS_TICK = { fill: INK.muted, fontSize: 11, fontFamily: "'Spline Sans Mono', monospace" }

const TOOLTIP_STYLE = {
  backgroundColor: '#fdfcf8',
  border: '1px solid #d8d2c2',
  borderRadius: 6,
  color: '#1d1b14',
  fontSize: 12,
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
      <PageHeader no="03" title="Analytics" description="Staleness patterns and validation trends" />

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
          colorClass="text-ledger-secondary"
        />
        <BigStat
          icon={<Activity size={18} />}
          label="Staleness Rate"
          value={heatmap.data ? `${computeOverallStaleness(heatmap.data)}%` : '--'}
          colorClass="text-ledger-tertiary"
        />
        <BigStat
          icon={<Database size={18} />}
          label="Total Memories"
          value={s ? String(s.total) : '--'}
          colorClass="text-ledger-primary"
        />
      </div>

      {/* ─── Trust Distribution Bar Chart + Staleness Heatmap ─── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Trust Score Distribution */}
        <div className="card lg:col-span-7">
          <div className="card-header">Trust Score Distribution</div>
          <div className="p-5">
            {trustDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trustDistribution} barCategoryGap="20%">
                  <XAxis
                    dataKey="range"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: 'rgba(29, 27, 20, 0.04)' }}
                  />
                  <Bar
                    dataKey="count"
                    radius={[3, 3, 0, 0]}
                    fill={INK.blue}
                    name="Memories"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] items-center justify-center">
                <p className="text-xs text-ledger-on-surface-variant">No data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Staleness Heatmap Grid */}
        <div className="card lg:col-span-5">
          <div className="card-header">Staleness Heatmap</div>
          <div className="p-5">
            {heatmap.data?.length ? (
              <div className="space-y-3">
                {heatmap.data.map((entry) => {
                  const rate = entry.staleness_rate ?? 0
                  return (
                    <div key={entry.fact_type} className="flex items-center gap-3">
                      <span className="w-24 truncate text-xs font-medium text-ledger-on-surface-variant">
                        {titleCase(entry.fact_type)}
                      </span>
                      <div className="flex-1 flex gap-1">
                        {renderHeatmapBlocks(rate)}
                      </div>
                      <span className="mono w-10 text-right text-xs tabular-nums text-ledger-on-surface-variant">
                        {rate > 0 ? `${Math.round(rate * 100)}%` : '--'}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex h-[180px] items-center justify-center">
                <p className="text-xs text-ledger-on-surface-variant">Not enough data yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Health Telemetry Line Chart ─── */}
      <div className="card">
        <div className="card-header">Health Telemetry</div>
        <div className="p-5">
          {telemetry.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={telemetry}>
                <CartesianGrid stroke="rgba(29, 27, 20, 0.08)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area
                  type="monotone"
                  dataKey="validated"
                  stroke={INK.green}
                  fill={INK.green}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  name="Validated"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="flagged"
                  stroke={INK.amber}
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
              <p className="text-xs text-ledger-on-surface-variant">No telemetry data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── High-Risk Memories Table ─── */}
      <div className="card overflow-hidden">
        <div className="card-header justify-between">
          <span>High-Risk Memories</span>
          <span className="normal-case tracking-normal font-body font-normal text-[10px] text-ledger-outline">
            Low trust + high retrieval = highest risk
          </span>
        </div>
        {risk.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="mono px-5 py-2.5 text-left text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">Content</th>
                  <th className="mono w-28 px-5 py-2.5 text-left text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">Type</th>
                  <th className="mono w-20 px-5 py-2.5 text-left text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">Trust</th>
                  <th className="mono w-20 px-5 py-2.5 text-right text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">Retrievals</th>
                  <th className="mono w-20 px-5 py-2.5 text-right text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">Risk</th>
                </tr>
              </thead>
              <tbody>
                {risk.data.map((m) => (
                  <tr key={m.id} className="table-row">
                    <td className="max-w-sm truncate px-5 py-3 text-ledger-on-surface">{m.content}</td>
                    <td className="px-5 py-3">
                      <span className="mono rounded-sharp bg-ledger-surface-high px-2 py-0.5 text-[11px] text-ledger-on-surface-variant">
                        {titleCase(m.fact_type)}
                      </span>
                    </td>
                    <td className="px-5 py-3"><TrustScoreBadge score={m.trust_score} /></td>
                    <td className="mono px-5 py-3 text-right tabular-nums text-ledger-on-surface-variant">
                      {m.retrieval_count}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="stamp text-ledger-error bg-ledger-error-container/70">
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
            <p className="text-sm text-ledger-on-surface-variant">No high-risk memories detected</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Big stat card: ledger entry with serif numeral ─── */
function BigStat({
  icon,
  label,
  value,
  colorClass,
}: {
  icon: React.ReactNode
  label: string
  value: string
  colorClass: string
}) {
  return (
    <div className="card flex flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        <span className={colorClass}>{icon}</span>
        <span className="mono text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">
          {label}
        </span>
      </div>
      <span className={`font-headline text-4xl font-semibold tabular-nums ${colorClass}`}>
        {value}
      </span>
    </div>
  )
}

/* ─── Heatmap blocks renderer ─── */
function renderHeatmapBlocks(rate: number) {
  const blockCount = 10
  const filledCount = Math.round(rate * blockCount)
  const filledClass =
    rate <= 0.3 ? 'bg-ledger-secondary' : rate <= 0.6 ? 'bg-ledger-tertiary' : 'bg-ledger-error'
  const blocks = []

  for (let i = 0; i < blockCount; i++) {
    const filled = i < filledCount
    blocks.push(
      <div
        key={i}
        className={`h-4 flex-1 rounded-[2px] transition-colors ${
          filled ? filledClass : 'bg-ledger-surface-highest opacity-40'
        }`}
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
