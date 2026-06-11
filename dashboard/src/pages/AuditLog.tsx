import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { fetchAuditLogs, verifyAuditIntegrity } from '../api/client'
import PageHeader from '../components/PageHeader'
import ErrorBanner from '../components/ErrorBanner'
import Pagination from '../components/Pagination'
import { ShieldCheck, ShieldAlert, Lock, User, Clock, Hash, FileText, Search } from 'lucide-react'
import { formatRelative, titleCase } from '../utils/time'

const EVENT_TYPES = ['memory_validated', 'memory_quarantined', 'memory_restored', 'trust_score_changed', 'connector_synced']

/* Stamp tone per event type — ledger ink colors */
const EVENT_STAMP_CLASSES: Record<string, string> = {
  memory_validated: 'text-ledger-secondary bg-ledger-secondary/[0.07]',
  memory_quarantined: 'text-ledger-error bg-ledger-error-container/70',
  memory_restored: 'text-ledger-primary bg-ledger-primary/[0.07]',
  trust_score_changed: 'text-ledger-tertiary bg-ledger-tertiary/[0.08]',
  connector_synced: 'text-ledger-primary bg-ledger-primary/[0.07]',
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
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        no="06"
        title="Audit Log"
        description="Tamper-evident chain of every event"
        actions={
          <button onClick={() => verify.mutate()} disabled={verify.isPending} className="btn-secondary shrink-0">
            <Lock size={14} />
            {verify.isPending ? 'Verifying...' : 'Verify Chain Integrity'}
          </button>
        }
      />

      {auditQuery.isError && (
        <ErrorBanner message={(auditQuery.error as Error).message} onRetry={() => auditQuery.refetch()} />
      )}

      {/* Integrity verification verdict panel */}
      {verify.data && (
        <div className={`card p-6 ${verify.data.valid ? 'border-ledger-secondary/50' : 'border-ledger-error/60'}`}>
          <div className="flex flex-wrap items-center gap-6">
            {/* The verdict stamp */}
            <span
              className={`stamp animate-stamp-in px-4 py-2 text-sm ${
                verify.data.valid
                  ? 'text-ledger-secondary bg-ledger-secondary/[0.07]'
                  : 'text-ledger-error bg-ledger-error-container/70'
              }`}
            >
              {verify.data.valid ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
              {verify.data.valid ? 'Verified' : 'Broken'}
            </span>

            <div className="flex-1 min-w-[200px]">
              {verify.data.valid ? (
                <>
                  <p className="font-headline text-lg font-semibold text-ledger-secondary">Chain Integrity Verified</p>
                  <p className="mt-1 text-sm text-ledger-on-surface-variant">
                    All {verify.data.entries_checked} entries checked. No tampering or gaps detected in the cryptographic chain.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-headline text-lg font-semibold text-ledger-error">Integrity Violation Detected</p>
                  <p className="mt-1 text-sm text-ledger-on-surface-variant">
                    Chain broken at entry #{verify.data.first_broken_index}. {verify.data.entries_checked} entries were checked before the break was found.
                  </p>
                </>
              )}
            </div>

            {/* Stats */}
            <div className="hidden sm:flex gap-8 shrink-0">
              <div className="text-center">
                <p className="font-headline text-2xl font-semibold tabular-nums text-ledger-on-surface">{verify.data.entries_checked}</p>
                <p className="mono text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">Entries</p>
              </div>
              <div className="text-center">
                <p className={`font-headline text-2xl font-semibold tabular-nums ${verify.data.valid ? 'text-ledger-secondary' : 'text-ledger-error'}`}>
                  {verify.data.valid ? '0' : '1'}
                </p>
                <p className="mono text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">Breaks</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ledger-outline" />
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

      {/* Ledger entries */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="shimmer h-16" />
          ))}
        </div>
      ) : !filtered.length ? (
        <div className="card flex h-48 items-center justify-center">
          <div className="text-center">
            <FileText size={28} className="mx-auto text-ledger-outline" />
            <p className="mt-2 text-sm text-ledger-on-surface-variant">No audit entries found</p>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="card-header justify-between">
            <span>Ledger Entries</span>
            <span className="tabular-nums">{filtered.length} shown</span>
          </div>

          <div>
            {filtered.map((entry) => {
              const stampClass = EVENT_STAMP_CLASSES[entry.event_type] ?? 'text-ledger-on-surface-variant bg-ledger-surface-high'
              const detailStr = JSON.stringify(entry.details)
              const truncated = detailStr.length > 120 ? detailStr.slice(0, 120) + '...' : detailStr

              return (
                <div key={entry.id} className="table-row px-5 py-3.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      {/* Event stamp + actor + timestamp */}
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`stamp ${stampClass}`}>{titleCase(entry.event_type)}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-ledger-on-surface-variant">
                          <User size={12} className="text-ledger-outline" />
                          {entry.actor ?? 'system'}
                        </span>
                        <span className="mono inline-flex items-center gap-1.5 text-xs text-ledger-on-surface-variant">
                          <Clock size={12} className="text-ledger-outline" />
                          {formatRelative(entry.created_at)}
                        </span>
                      </div>

                      {/* Truncated details */}
                      <p className="mono mt-2 max-w-xl truncate text-xs leading-relaxed text-ledger-outline">
                        {truncated}
                      </p>
                    </div>

                    {/* Checksum */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Hash size={11} className="text-ledger-outline" />
                      <span className="mono rounded-sharp border border-ledger-outline-variant bg-ledger-surface-lowest px-2 py-0.5 text-[11px] text-ledger-on-surface-variant">
                        {entry.checksum.slice(0, 12)}
                      </span>
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
