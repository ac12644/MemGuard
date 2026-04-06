import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchHealthScore, fetchValidations, fetchMemoryStats, fetchStalenessHeatmap, fetchConnectors } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import HealthScore from '../components/HealthScore'
import StatusBadge from '../components/StatusBadge'
import Onboarding from '../components/Onboarding'
import { Brain, ShieldCheck, AlertTriangle, ShieldAlert, Clock, Zap, ChevronRight } from 'lucide-react'
import { formatRelative, titleCase } from '../utils/time'

/* ─── color constants matching Obsidian Intelligence tokens ─── */
const C = {
  primary: '#adc6ff',
  secondary: '#4edea3',
  tertiary: '#ffb95f',
  error: '#ffb4ab',
  onSurface: '#dae2fd',
  onSurfaceVariant: '#c5c6cd',
  surfaceContainer: '#171f33',
  surfaceHigh: '#222a3d',
  surfaceHighest: '#2d3449',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const health = useQuery({ queryKey: ['health-score'], queryFn: fetchHealthScore })
  const stats = useQuery({ queryKey: ['memory-stats'], queryFn: fetchMemoryStats })
  const jobs = useQuery({ queryKey: ['validations', { limit: '5' }], queryFn: () => fetchValidations({ limit: '5' }) })
  const heatmap = useQuery({ queryKey: ['staleness-heatmap'], queryFn: fetchStalenessHeatmap })
  const connectors = useQuery({ queryKey: ['connectors'], queryFn: fetchConnectors })

  const h = health.data
  const s = stats.data

  const showOnboarding = (s?.total ?? 0) === 0 || !connectors.data?.length

  if (showOnboarding && !stats.isLoading && !connectors.isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        {(health.isError || stats.isError) && (
          <ErrorBanner
            message="Could not connect to MemGuard API"
            onRetry={() => { health.refetch(); stats.refetch() }}
          />
        )}
        <Onboarding
          hasConnectors={!!connectors.data?.length}
          hasMemories={(s?.total ?? 0) > 0}
          hasValidations={(jobs.data?.length ?? 0) > 0}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-headline text-2xl font-bold" style={{ color: C.onSurface }}>
          Dashboard
        </h1>
        <p className="mt-1 text-sm" style={{ color: C.onSurfaceVariant }}>
          Monitor the health of your agent memory systems
        </p>
      </div>

      {(health.isError || stats.isError) && (
        <ErrorBanner
          message="Could not connect to MemGuard API"
          onRetry={() => { health.refetch(); stats.refetch() }}
        />
      )}

      {/* ─── Top row: Stat cards + Health ring ─── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Stat cards column */}
        <div className="lg:col-span-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AccentStatCard
            accentColor={C.primary}
            icon={<Brain size={15} />}
            label="Total Memories"
            value={s?.total ?? '-'}
            onClick={() => navigate('/memories')}
          />
          <AccentStatCard
            accentColor={C.secondary}
            icon={<ShieldCheck size={15} />}
            label="Active"
            value={s?.active ?? '-'}
            sub={s ? `${((s.active / Math.max(s.total, 1)) * 100).toFixed(0)}%` : undefined}
            onClick={() => navigate('/memories?status=active')}
          />
          <AccentStatCard
            accentColor={C.tertiary}
            icon={<AlertTriangle size={15} />}
            label="Flagged"
            value={s?.flagged ?? '-'}
            onClick={() => navigate('/memories?status=flagged')}
          />
          <AccentStatCard
            accentColor={C.error}
            icon={<ShieldAlert size={15} />}
            label="Quarantined"
            value={s?.quarantined ?? '-'}
            onClick={() => navigate('/quarantine')}
          />
        </div>

        {/* Health ring gauge */}
        <div
          className="lg:col-span-4 flex flex-col items-center justify-center rounded-xl p-8"
          style={{ backgroundColor: C.surfaceContainer, boxShadow: 'var(--shadow-ambient)' }}
        >
          {h ? (
            <HealthScore score={h.overall_score} />
          ) : (
            <div className="space-y-3 flex flex-col items-center">
              <div className="shimmer h-36 w-36 rounded-full" />
              <div className="shimmer h-3 w-24" />
            </div>
          )}
        </div>
      </div>

      {/* ─── Active Validations Timeline ─── */}
      <div
        className="rounded-xl"
        style={{ backgroundColor: C.surfaceContainer, boxShadow: 'var(--shadow-ambient)' }}
      >
        <div className="flex items-center gap-2 px-5 py-3 rounded-t-xl" style={{ backgroundColor: C.surfaceHigh }}>
          <Zap size={14} style={{ color: C.primary }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.onSurfaceVariant }}>
            Active Validations
          </span>
        </div>
        <div className="p-5">
          {jobs.data?.length ? (
            <div className="space-y-3">
              {jobs.data.map((j) => (
                <div
                  key={j.id}
                  className="flex flex-wrap items-center gap-4 rounded-lg px-4 py-3 transition-colors"
                  style={{ ['--hover-bg' as string]: C.surfaceHigh }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.surfaceHigh)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div className="flex items-center gap-3 min-w-[140px]">
                    <Clock size={14} style={{ color: C.onSurfaceVariant }} />
                    <span className="text-sm font-medium" style={{ color: C.onSurface }}>
                      {titleCase(j.job_type)}
                    </span>
                  </div>
                  <StatusBadge status={j.status} />
                  <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                    <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: C.surfaceHighest }}>
                      <div
                        className="h-1.5 rounded-full transition-all duration-700"
                        style={{
                          width: `${j.progress * 100}%`,
                          background: `linear-gradient(90deg, ${C.primary}, ${C.secondary})`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono" style={{ color: C.onSurfaceVariant }}>
                      {Math.round(j.progress * 100)}%
                    </span>
                  </div>
                  {j.flagged_count > 0 && (
                    <span className="text-xs font-semibold" style={{ color: C.tertiary }}>
                      {j.flagged_count} flagged
                    </span>
                  )}
                  <span className="text-xs ml-auto" style={{ color: C.onSurfaceVariant }}>
                    {formatRelative(j.created_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-20 items-center justify-center">
              <p className="text-sm" style={{ color: C.onSurfaceVariant }}>No validation jobs yet</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Bottom row: Staleness Heatmap + Critical Alerts ─── */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">
        {/* Staleness Heatmap — colored grid blocks */}
        <div
          className="lg:col-span-7 rounded-xl"
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
                        className="w-28 truncate text-xs font-medium"
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
              <div className="flex h-32 items-center justify-center">
                <p className="text-xs" style={{ color: C.onSurfaceVariant }}>Not enough data yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Critical Alerts */}
        <div
          className="lg:col-span-5 rounded-xl"
          style={{ backgroundColor: C.surfaceContainer, boxShadow: 'var(--shadow-ambient)' }}
        >
          <div
            className="px-5 py-3 rounded-t-xl flex items-center gap-2"
            style={{ backgroundColor: 'rgba(147, 0, 10, 0.25)' }}
          >
            <AlertTriangle size={14} style={{ color: C.error }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.error }}>
              Critical Alerts
            </span>
          </div>
          <div className="p-5">
            {buildAlerts(h, s).length > 0 ? (
              <div className="space-y-3">
                {buildAlerts(h, s).map((alert, i) => (
                  <div
                    key={i}
                    onClick={() => navigate(alert.link)}
                    className="flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer transition-colors hover:bg-[rgba(147,0,10,0.2)]"
                    style={{ backgroundColor: 'rgba(147, 0, 10, 0.1)' }}
                  >
                    <div
                      className="mt-0.5 h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: alert.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: C.onSurface }}>{alert.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: C.onSurfaceVariant }}>{alert.message}</p>
                    </div>
                    <ChevronRight size={16} style={{ color: C.onSurfaceVariant }} className="shrink-0" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center">
                <p className="text-sm" style={{ color: C.secondary }}>All systems nominal</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Recent Validations Table ─── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: C.surfaceContainer, boxShadow: 'var(--shadow-ambient)' }}
      >
        <div className="px-5 py-3" style={{ backgroundColor: C.surfaceHigh }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.onSurfaceVariant }}>
            Recent Validations
          </span>
        </div>
        <div className="overflow-x-auto">
          {jobs.data?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: C.surfaceHigh }}>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.onSurfaceVariant }}>Type</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.onSurfaceVariant }}>Status</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.onSurfaceVariant }}>Progress</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.onSurfaceVariant }}>Flagged</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.onSurfaceVariant }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.data.map((j) => (
                  <tr key={j.id} className="transition-colors hover:bg-obsidian-surface-high">
                    <td className="px-5 py-3 font-medium" style={{ color: C.onSurface }}>{titleCase(j.job_type)}</td>
                    <td className="px-5 py-3"><StatusBadge status={j.status} /></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 rounded-full" style={{ backgroundColor: C.surfaceHighest }}>
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{
                              width: `${j.progress * 100}%`,
                              background: `linear-gradient(90deg, ${C.primary}, ${C.secondary})`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono" style={{ color: C.onSurfaceVariant }}>
                          {Math.round(j.progress * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span style={{ color: j.flagged_count > 0 ? C.tertiary : C.onSurfaceVariant, fontWeight: j.flagged_count > 0 ? 600 : 400 }}>
                        {j.flagged_count}
                      </span>
                    </td>
                    <td className="px-5 py-3" style={{ color: C.onSurfaceVariant }}>
                      {formatRelative(j.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex h-28 items-center justify-center">
              <p className="text-sm" style={{ color: C.onSurfaceVariant }}>No validation jobs yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Accent Stat Card: colored left bar, no border ─── */
function AccentStatCard({
  accentColor,
  icon,
  label,
  value,
  sub,
  onClick,
}: {
  accentColor: string
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="flex overflow-hidden rounded-lg cursor-pointer transition-all hover:scale-[1.01] hover:brightness-110"
      style={{ backgroundColor: C.surfaceContainer, boxShadow: 'var(--shadow-ambient)' }}
    >
      {/* Left accent bar */}
      <div className="w-[3px] shrink-0" style={{ backgroundColor: accentColor }} />
      <div className="flex-1 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded"
            style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
          >
            {icon}
          </div>
          <div>
            <p className="font-headline text-lg font-bold leading-tight" style={{ color: C.onSurface }}>
              {value}
            </p>
            <p className="text-[10px] font-medium" style={{ color: C.onSurfaceVariant }}>
              {label}
            </p>
          </div>
        </div>
        {sub && (
          <p className="mt-1 text-[10px] font-medium pl-[38px]" style={{ color: C.onSurfaceVariant }}>
            {sub} of total
          </p>
        )}
      </div>
    </div>
  )
}

/* ─── Heatmap blocks renderer ─── */
function renderHeatmapBlocks(rate: number) {
  const blockCount = 12
  const filledCount = Math.round(rate * blockCount)
  const blocks = []

  for (let i = 0; i < blockCount; i++) {
    let color: string
    if (i >= filledCount) {
      color = C.surfaceHighest
    } else if (rate <= 0.3) {
      color = C.secondary // green
    } else if (rate <= 0.6) {
      color = C.tertiary // amber
    } else {
      color = C.error // red
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

/* ─── Build alert items from health data ─── */
function buildAlerts(
  h: { overall_score: number; quarantined_count: number; flagged_count: number; oldest_unvalidated_days?: number } | undefined,
  s: { quarantined: number; flagged: number } | undefined,
) {
  const alerts: { title: string; message: string; color: string; link: string }[] = []

  if (h && h.overall_score < 0.5) {
    alerts.push({
      title: 'Health score critical',
      message: `Overall health at ${Math.round(h.overall_score * 100)}% -- below 50% threshold.`,
      color: C.error,
      link: '/analytics',
    })
  }
  if (s && s.quarantined > 0) {
    alerts.push({
      title: `${s.quarantined} quarantined memor${s.quarantined === 1 ? 'y' : 'ies'}`,
      message: 'Review and remediate quarantined memories to restore trust.',
      color: C.error,
      link: '/quarantine',
    })
  }
  if (s && s.flagged > 0) {
    alerts.push({
      title: `${s.flagged} flagged memor${s.flagged === 1 ? 'y' : 'ies'}`,
      message: 'Memories with degraded trust scores requiring attention.',
      color: C.tertiary,
      link: '/memories?status=flagged',
    })
  }
  if (h && h.oldest_unvalidated_days && h.oldest_unvalidated_days > 14) {
    alerts.push({
      title: 'Stale validations detected',
      message: `Some memories unvalidated for ${h.oldest_unvalidated_days} days.`,
      color: C.tertiary,
      link: '/validations',
    })
  }

  return alerts
}
