import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchHealthScore, fetchValidations, fetchMemoryStats, fetchStalenessHeatmap, fetchConnectors } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import HealthScore from '../components/HealthScore'
import StatusBadge from '../components/StatusBadge'
import Onboarding from '../components/Onboarding'
import PageHeader from '../components/PageHeader'
import { Brain, ShieldCheck, AlertTriangle, ShieldAlert, Clock, Zap, ChevronRight } from 'lucide-react'
import { formatRelative, titleCase } from '../utils/time'

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
      <PageHeader no="01" title="Overview" description="The state of your agent memory, at a glance" />

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
          <StatCard
            accentClass="bg-ledger-primary"
            icon={<Brain size={15} />}
            label="Total Memories"
            value={s?.total ?? '-'}
            onClick={() => navigate('/memories')}
          />
          <StatCard
            accentClass="bg-ledger-secondary"
            icon={<ShieldCheck size={15} />}
            label="Active"
            value={s?.active ?? '-'}
            sub={s ? `${((s.active / Math.max(s.total, 1)) * 100).toFixed(0)}%` : undefined}
            onClick={() => navigate('/memories?status=active')}
          />
          <StatCard
            accentClass="bg-ledger-tertiary"
            icon={<AlertTriangle size={15} />}
            label="Flagged"
            value={s?.flagged ?? '-'}
            onClick={() => navigate('/memories?status=flagged')}
          />
          <StatCard
            accentClass="bg-ledger-error"
            icon={<ShieldAlert size={15} />}
            label="Quarantined"
            value={s?.quarantined ?? '-'}
            onClick={() => navigate('/quarantine')}
          />
        </div>

        {/* Health ring gauge */}
        <div className="card lg:col-span-4 flex flex-col items-center justify-center p-8">
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
      <div className="card">
        <div className="card-header">
          <Zap size={13} className="text-ledger-primary" />
          Active Validations
        </div>
        <div className="p-4">
          {jobs.data?.length ? (
            <div>
              {jobs.data.map((j) => (
                <div
                  key={j.id}
                  className="flex flex-wrap items-center gap-4 border-b border-[rgba(29,27,20,0.12)] px-3 py-3 transition-colors last:border-b-0 hover:bg-ledger-surface-low"
                >
                  <div className="flex items-center gap-3 min-w-[140px]">
                    <Clock size={14} className="text-ledger-on-surface-variant" />
                    <span className="text-sm font-medium text-ledger-on-surface">
                      {titleCase(j.job_type)}
                    </span>
                  </div>
                  <StatusBadge status={j.status} />
                  <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                    <ProgressBar progress={j.progress} />
                    <span className="mono text-xs tabular-nums text-ledger-on-surface-variant">
                      {Math.round(j.progress * 100)}%
                    </span>
                  </div>
                  {j.flagged_count > 0 && (
                    <span className="mono text-xs font-semibold text-ledger-tertiary">
                      {j.flagged_count} flagged
                    </span>
                  )}
                  <span className="mono ml-auto text-xs text-ledger-on-surface-variant">
                    {formatRelative(j.created_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-20 items-center justify-center">
              <p className="text-sm text-ledger-on-surface-variant">No validation jobs yet</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Bottom row: Staleness Heatmap + Critical Alerts ─── */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">
        {/* Staleness Heatmap — colored grid blocks */}
        <div className="card lg:col-span-7">
          <div className="card-header">Staleness Heatmap</div>
          <div className="p-5">
            {heatmap.data?.length ? (
              <div className="space-y-3">
                {heatmap.data.map((entry) => {
                  const rate = entry.staleness_rate ?? 0
                  return (
                    <div key={entry.fact_type} className="flex items-center gap-3">
                      <span className="mono w-28 truncate text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">
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
              <div className="flex h-32 items-center justify-center">
                <p className="text-xs text-ledger-on-surface-variant">Not enough data yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Critical Alerts */}
        <div className="card lg:col-span-5 border-ledger-error/30">
          <div className="flex items-center gap-2 rounded-t-[0.375rem] border-b border-ledger-error/30 bg-ledger-error-container/50 px-5 py-2.5">
            <AlertTriangle size={13} className="text-ledger-error" />
            <span className="mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ledger-error">
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
                    className="flex cursor-pointer items-center gap-3 rounded-sharp border border-ledger-error/20 bg-ledger-error-container/40 px-4 py-3 transition-colors hover:bg-ledger-error-container/70"
                  >
                    <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${alert.dotClass}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ledger-on-surface">{alert.title}</p>
                      <p className="mt-0.5 text-xs text-ledger-on-surface-variant">{alert.message}</p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-ledger-on-surface-variant" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center">
                <p className="text-sm text-ledger-secondary">All systems nominal</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Recent Validations Table ─── */}
      <div className="card overflow-hidden">
        <div className="card-header">Recent Validations</div>
        <div className="overflow-x-auto">
          {jobs.data?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="mono px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.12em] text-ledger-on-surface-variant">Type</th>
                  <th className="mono px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.12em] text-ledger-on-surface-variant">Status</th>
                  <th className="mono px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.12em] text-ledger-on-surface-variant">Progress</th>
                  <th className="mono px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.12em] text-ledger-on-surface-variant">Flagged</th>
                  <th className="mono px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.12em] text-ledger-on-surface-variant">Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.data.map((j) => (
                  <tr key={j.id} className="table-row">
                    <td className="px-5 py-3 font-medium text-ledger-on-surface">{titleCase(j.job_type)}</td>
                    <td className="px-5 py-3"><StatusBadge status={j.status} /></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <ProgressBar progress={j.progress} className="w-24 flex-none" />
                        <span className="mono text-xs tabular-nums text-ledger-on-surface-variant">
                          {Math.round(j.progress * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          j.flagged_count > 0
                            ? 'mono font-semibold text-ledger-tertiary'
                            : 'mono text-ledger-on-surface-variant'
                        }
                      >
                        {j.flagged_count}
                      </span>
                    </td>
                    <td className="mono px-5 py-3 text-xs text-ledger-on-surface-variant">
                      {formatRelative(j.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex h-28 items-center justify-center">
              <p className="text-sm text-ledger-on-surface-variant">No validation jobs yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Progress bar: recessed track, solid ink fill ─── */
function ProgressBar({ progress, className = 'flex-1' }: { progress: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full border border-ledger-outline-variant bg-ledger-surface-lowest ${className}`}>
      <div
        className="h-full rounded-full bg-ledger-primary transition-all duration-700"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  )
}

/* ─── Stat card: paper sheet with a thin colored top rule ─── */
function StatCard({
  accentClass,
  icon,
  label,
  value,
  sub,
  onClick,
}: {
  accentClass: string
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="card relative cursor-pointer overflow-hidden px-4 py-3.5 text-left transition-all hover:-translate-y-px hover:shadow-lifted"
    >
      {/* Colored top rule */}
      <div className={`absolute inset-x-0 top-0 h-[2px] ${accentClass}`} />
      <div className="flex items-center justify-between gap-2">
        <span className="ledger-no">{label}</span>
        <span className="text-ledger-outline">{icon}</span>
      </div>
      <p className="mt-2 font-headline text-3xl font-semibold leading-none tabular-nums text-ledger-on-surface">
        {value}
      </p>
      {sub && (
        <p className="mono mt-1.5 text-[11px] tabular-nums text-ledger-on-surface-variant">
          {sub} of total
        </p>
      )}
    </button>
  )
}

/* ─── Heatmap blocks renderer ─── */
function renderHeatmapBlocks(rate: number) {
  const blockCount = 12
  const filledCount = Math.round(rate * blockCount)

  const fillClass =
    rate <= 0.3 ? 'bg-ledger-secondary' : rate <= 0.6 ? 'bg-ledger-tertiary' : 'bg-ledger-error'

  const blocks = []
  for (let i = 0; i < blockCount; i++) {
    const filled = i < filledCount
    blocks.push(
      <div
        key={i}
        className={`h-4 flex-1 rounded-sm border transition-colors ${
          filled ? `${fillClass} border-transparent` : 'bg-ledger-surface-highest border-ledger-outline-variant/60'
        }`}
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
  const alerts: { title: string; message: string; dotClass: string; link: string }[] = []

  if (h && h.overall_score < 0.5) {
    alerts.push({
      title: 'Health score critical',
      message: `Overall health at ${Math.round(h.overall_score * 100)}% -- below 50% threshold.`,
      dotClass: 'bg-ledger-error',
      link: '/analytics',
    })
  }
  if (s && s.quarantined > 0) {
    alerts.push({
      title: `${s.quarantined} quarantined memor${s.quarantined === 1 ? 'y' : 'ies'}`,
      message: 'Review and remediate quarantined memories to restore trust.',
      dotClass: 'bg-ledger-error',
      link: '/quarantine',
    })
  }
  if (s && s.flagged > 0) {
    alerts.push({
      title: `${s.flagged} flagged memor${s.flagged === 1 ? 'y' : 'ies'}`,
      message: 'Memories with degraded trust scores requiring attention.',
      dotClass: 'bg-ledger-tertiary',
      link: '/memories?status=flagged',
    })
  }
  if (h && h.oldest_unvalidated_days && h.oldest_unvalidated_days > 14) {
    alerts.push({
      title: 'Stale validations detected',
      message: `Some memories unvalidated for ${h.oldest_unvalidated_days} days.`,
      dotClass: 'bg-ledger-tertiary',
      link: '/validations',
    })
  }

  return alerts
}
