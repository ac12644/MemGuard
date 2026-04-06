import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { fetchAuditLogs, verifyAuditIntegrity } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import ErrorBanner from '../components/ErrorBanner'
import Pagination from '../components/Pagination'
import { ShieldCheck, ShieldAlert, Lock, User, Clock, Hash, FileText, Search } from 'lucide-react'
import { formatRelative, titleCase } from '../utils/time'

const EVENT_TYPES = ['memory_validated', 'memory_quarantined', 'memory_restored', 'trust_score_changed', 'connector_synced']

const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
  memory_validated: { bg: 'rgba(78, 222, 163, 0.1)', text: 'var(--color-secondary)' },
  memory_quarantined: { bg: 'rgba(255, 180, 171, 0.1)', text: 'var(--color-error)' },
  memory_restored: { bg: 'rgba(173, 198, 255, 0.1)', text: 'var(--color-primary)' },
  trust_score_changed: { bg: 'rgba(255, 185, 95, 0.1)', text: 'var(--color-tertiary)' },
  connector_synced: { bg: 'rgba(173, 198, 255, 0.1)', text: 'var(--color-primary)' },
}

export default function AuditLog() {
  const [eventType, setEventType] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 30

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [eventType, search])

  const params: Record<string, string> = { limit: String(pageSize), offset: String((page - 1) * pageSize) }
  if (eventType) params.event_type = eventType

  const auditQuery = useQuery({ queryKey: ['audit', params], queryFn: () => fetchAuditLogs(params) })
  const { data: logs, isLoading } = auditQuery
  const verify = useMutation({ mutationFn: verifyAuditIntegrity })

  const filtered = logs?.filter(entry => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      entry.event_type.toLowerCase().includes(q) ||
      (entry.actor ?? '').toLowerCase().includes(q) ||
      JSON.stringify(entry.details).toLowerCase().includes(q)
    )
  }) ?? []

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-on-surface)' }}>Audit Log & Integrity</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-outline)' }}>Tamper-proof event trail with cryptographic chain verification</p>
        </div>
        <button onClick={() => verify.mutate()} disabled={verify.isPending} className="btn-secondary shrink-0">
          <Lock size={14} />
          {verify.isPending ? 'Verifying...' : 'Verify Chain Integrity'}
        </button>
      </div>

      {auditQuery.isError && (
        <ErrorBanner message={(auditQuery.error as Error).message} onRetry={() => auditQuery.refetch()} />
      )}

      {/* Integrity verification banner */}
      {verify.data && (
        <div className="card p-6">
          <div className="flex items-center gap-6">
            {/* Circular gauge */}
            <div className="relative shrink-0">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle
                  cx="40" cy="40" r="34"
                  fill="none"
                  stroke="var(--color-surface-container-high)"
                  strokeWidth="6"
                />
                <circle
                  cx="40" cy="40" r="34"
                  fill="none"
                  stroke={verify.data.valid ? 'var(--color-secondary)' : 'var(--color-error)'}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 34}`}
                  strokeDashoffset={verify.data.valid ? '0' : `${2 * Math.PI * 34 * 0.25}`}
                  transform="rotate(-90 40 40)"
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {verify.data.valid ? (
                  <ShieldCheck size={24} style={{ color: 'var(--color-secondary)' }} />
                ) : (
                  <ShieldAlert size={24} style={{ color: 'var(--color-error)' }} />
                )}
              </div>
            </div>

            <div className="flex-1">
              {verify.data.valid ? (
                <>
                  <p className="text-lg font-semibold" style={{ color: 'var(--color-secondary)' }}>Chain Integrity Verified</p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--color-outline)' }}>
                    All {verify.data.entries_checked} entries checked. No tampering or gaps detected in the cryptographic chain.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold" style={{ color: 'var(--color-error)' }}>Integrity Violation Detected</p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--color-outline)' }}>
                    Chain broken at entry #{verify.data.first_broken_index}. {verify.data.entries_checked} entries were checked before the break was found.
                  </p>
                </>
              )}
            </div>

            {/* Stats */}
            <div className="hidden sm:flex gap-6 shrink-0">
              <div className="text-center">
                <p className="text-2xl font-bold font-mono" style={{ color: 'var(--color-on-surface)' }}>{verify.data.entries_checked}</p>
                <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-outline)' }}>Entries</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono" style={{ color: verify.data.valid ? 'var(--color-secondary)' : 'var(--color-error)' }}>
                  {verify.data.valid ? '0' : '1'}
                </p>
                <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-outline)' }}>Breaks</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-outline)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit entries..."
            className="input-field pl-8"
          />
        </div>
        <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="select-field">
          <option value="">All events</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>{titleCase(t)}</option>
          ))}
        </select>
        {eventType && (
          <button onClick={() => setEventType('')} className="btn-ghost text-xs">
            Clear filter
          </button>
        )}
      </div>

      {/* Timeline entries */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="shimmer h-20 rounded-xl" />
          ))}
        </div>
      ) : !filtered.length ? (
        <div className="card flex h-48 items-center justify-center">
          <div className="text-center">
            <FileText size={28} style={{ color: 'var(--color-outline)' }} className="mx-auto" />
            <p className="mt-2 text-sm" style={{ color: 'var(--color-outline)' }}>No audit entries found</p>
          </div>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div
            className="absolute left-5 top-0 bottom-0 w-px"
            style={{ backgroundColor: 'var(--color-surface-container-high)' }}
          />

          <div className="space-y-3">
            {filtered.map((entry) => {
              const colors = EVENT_COLORS[entry.event_type] ?? { bg: 'var(--color-surface-container-high)', text: 'var(--color-on-surface-variant)' }
              const detailStr = JSON.stringify(entry.details)
              const truncated = detailStr.length > 120 ? detailStr.slice(0, 120) + '...' : detailStr

              return (
                <div key={entry.id} className="relative pl-12">
                  {/* Timeline dot */}
                  <div
                    className="absolute left-[14px] top-5 h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: colors.text, boxShadow: `0 0 0 3px var(--color-surface-container)` }}
                  />

                  <div className="card px-5 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        {/* Event type badge */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className="inline-flex items-center rounded px-2.5 py-1 text-[11px] font-semibold"
                            style={{ backgroundColor: colors.bg, color: colors.text }}
                          >
                            {titleCase(entry.event_type)}
                          </span>
                        </div>

                        {/* Actor and details */}
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center gap-1.5">
                            <User size={12} style={{ color: 'var(--color-outline)' }} />
                            <span className="text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
                              {entry.actor ?? 'system'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock size={12} style={{ color: 'var(--color-outline)' }} />
                            <span className="text-xs" style={{ color: 'var(--color-outline)' }}>
                              {formatRelative(entry.created_at)}
                            </span>
                          </div>
                        </div>

                        {/* Truncated details */}
                        <p
                          className="mt-2 font-mono text-xs leading-relaxed truncate max-w-xl"
                          style={{ color: 'var(--color-outline)' }}
                        >
                          {truncated}
                        </p>
                      </div>

                      {/* Checksum */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Hash size={11} style={{ color: 'var(--color-outline)' }} />
                        <span
                          className="rounded px-2 py-0.5 font-mono text-[11px]"
                          style={{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-outline)' }}
                        >
                          {entry.checksum.slice(0, 12)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {logs && logs.length > 0 && (
        <Pagination page={page} pageSize={pageSize} total={logs.length < pageSize ? (page - 1) * pageSize + logs.length : (page + 1) * pageSize} onPageChange={setPage} />
      )}
    </div>
  )
}
