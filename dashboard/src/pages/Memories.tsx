import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchMemories, fetchMemoryStats } from '../api/client'
import TrustScoreBadge from '../components/TrustScoreBadge'
import StatusBadge from '../components/StatusBadge'
import ErrorBanner from '../components/ErrorBanner'
import Pagination from '../components/Pagination'
import { Search, Database, TrendingUp, ShieldCheck, Clock } from 'lucide-react'
import { formatRelative, titleCase } from '../utils/time'

export default function Memories() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [factType, setFactType] = useState(searchParams.get('fact_type') || '')
  const [sortBy, setSortBy] = useState('trust_score')
  const [sortOrder, setSortOrder] = useState('asc')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 24

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [status, factType, sortBy, sortOrder, search])

  const params: Record<string, string> = { sort_by: sortBy, sort_order: sortOrder, limit: String(pageSize), offset: String((page - 1) * pageSize) }
  if (status) params.status = status
  if (factType) params.fact_type = factType

  const memoriesQuery = useQuery({
    queryKey: ['memories', params],
    queryFn: () => fetchMemories(params),
  })
  const { data: memories, isLoading } = memoriesQuery

  const { data: stats } = useQuery({
    queryKey: ['memoryStats'],
    queryFn: fetchMemoryStats,
  })

  const filtered = memories?.filter(m => !search || m.content.toLowerCase().includes(search.toLowerCase())) ?? []

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-headline text-2xl font-bold text-obsidian-on-surface">Tracked Memories</h1>
        <p className="mt-1 text-sm text-obsidian-on-surface-variant">
          Browse and filter tracked memories with trust scores
        </p>
      </div>

      {memoriesQuery.isError && (
        <ErrorBanner message={(memoriesQuery.error as Error).message} onRetry={() => memoriesQuery.refetch()} />
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-obsidian-outline pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="input-field pl-8"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="select-field">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="flagged">Flagged</option>
          <option value="quarantined">Quarantined</option>
          <option value="invalidated">Invalidated</option>
        </select>
        <select value={factType} onChange={(e) => setFactType(e.target.value)} className="select-field">
          <option value="">All fact types</option>
          {['job_title', 'pricing', 'address', 'company_info', 'preference', 'technical_fact', 'policy', 'relationship', 'temporal', 'quantitative'].map((t) => (
            <option key={t} value={t}>{titleCase(t)}</option>
          ))}
        </select>
        <select
          value={`${sortBy}:${sortOrder}`}
          onChange={(e) => { const [s, o] = e.target.value.split(':'); setSortBy(s); setSortOrder(o) }}
          className="select-field"
        >
          <option value="trust_score:asc">Trust (low first)</option>
          <option value="trust_score:desc">Trust (high first)</option>
          <option value="retrieval_count:desc">Most retrieved</option>
          <option value="created_at:desc">Newest</option>
          <option value="last_validated_at:asc">Least recently validated</option>
        </select>
      </div>

      {/* Memory Cards */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-5 space-y-3">
              <div className="shimmer h-4 w-3/4" />
              <div className="shimmer h-3 w-1/2" />
              <div className="shimmer h-1.5 w-full" />
            </div>
          ))}
        </div>
      ) : !filtered.length ? (
        <div className="card flex h-48 items-center justify-center">
          <div className="text-center max-w-xs">
            <Database size={28} className="mx-auto" style={{ color: 'var(--color-outline)' }} />
            <p className="mt-3 text-sm font-medium text-obsidian-on-surface">
              No memories tracked yet
            </p>
            <p className="mt-1 text-xs text-obsidian-on-surface-variant">
              Connect a memory system and sync to get started.
            </p>
            <button
              onClick={() => navigate('/connectors')}
              className="btn-primary mt-4 text-xs"
            >
              Go to Connectors
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <div
              key={m.id}
              onClick={() => setExpanded(expanded === m.id ? null : m.id)}
              className={`card p-5 transition-all hover:bg-obsidian-surface-high group cursor-pointer ${expanded === m.id ? 'ring-1 ring-[#adc6ff]/20' : ''}`}
            >
              {/* Content */}
              <div className="flex items-start gap-2">
                <p className={`flex-1 text-sm leading-relaxed text-obsidian-on-surface min-h-[2.5rem] ${expanded === m.id ? '' : 'line-clamp-2'}`}>
                  {m.content}
                </p>
                <span className={`shrink-0 mt-0.5 text-obsidian-outline transition-transform ${expanded === m.id ? 'rotate-180' : ''}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                </span>
              </div>

              {/* Badges row */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {m.fact_type && (
                  <span className="rounded-sm bg-obsidian-surface-highest px-2 py-0.5 text-[11px] font-medium text-obsidian-on-surface-variant">
                    {titleCase(m.fact_type)}
                  </span>
                )}
                <StatusBadge status={m.status} />
              </div>

              {/* Trust bar */}
              <div className="mt-4">
                <TrustScoreBadge score={m.trust_score} size="md" />
              </div>

              {/* Footer meta */}
              <div className="mt-3 flex items-center justify-between text-[11px] text-obsidian-outline">
                <span className="tabular-nums">{m.retrieval_count} retrievals</span>
                <span>
                  {m.last_validated_at
                    ? `Validated ${formatRelative(m.last_validated_at)}`
                    : 'Not yet validated'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <Pagination page={page} pageSize={pageSize} total={stats?.total ?? 0} onPageChange={setPage} />

      {/* Bottom Stats Bar */}
      {stats && (
        <div className="card flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-obsidian-primary" />
            <span className="text-xs text-obsidian-on-surface-variant">Total</span>
            <span className="font-headline text-sm font-semibold text-obsidian-on-surface tabular-nums">
              {stats.total}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-[#4edea3]" />
            <span className="text-xs text-obsidian-on-surface-variant">Avg Trust</span>
            <span className="font-headline text-sm font-semibold text-obsidian-on-surface tabular-nums">
              {Math.round(stats.avg_trust_score * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-[#4edea3]" />
            <span className="text-xs text-obsidian-on-surface-variant">Active</span>
            <span className="font-headline text-sm font-semibold text-obsidian-on-surface tabular-nums">
              {stats.active}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-[#ffb95f]" />
            <span className="text-xs text-obsidian-on-surface-variant">Flagged</span>
            <span className="font-headline text-sm font-semibold text-[#ffb95f] tabular-nums">
              {stats.flagged}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
