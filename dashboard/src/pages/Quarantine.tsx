import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchQuarantine, restoreQuarantine, approveRemediation, verifyAuditIntegrity } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'
import { RotateCcw, Check, ShieldAlert, ShieldCheck } from 'lucide-react'

function IntegrityGauge({ valid, checked }: { valid: boolean; checked: number }) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const pct = valid ? 1 : 0.5
  const offset = circumference * (1 - pct)
  const strokeClass = valid ? 'stroke-ledger-secondary' : 'stroke-ledger-error'
  const textClass = valid ? 'text-ledger-secondary' : 'text-ledger-error'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            className="stroke-ledger-surface-highest"
            strokeWidth="6"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            className={`${strokeClass} transition-all duration-1000`}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={
              {
                '--circumference': circumference,
                '--offset': offset,
              } as React.CSSProperties
            }
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {valid ? (
            <ShieldCheck size={20} className="text-ledger-secondary" />
          ) : (
            <ShieldAlert size={20} className="text-ledger-error" />
          )}
        </div>
      </div>
      <div className="text-center">
        <p className={`mono text-[10px] font-semibold uppercase tracking-[0.12em] ${textClass}`}>
          {valid ? 'Chain Valid' : 'Chain Broken'}
        </p>
        <p className="mono text-[11px] tabular-nums text-ledger-on-surface-variant">{checked} entries checked</p>
      </div>
    </div>
  )
}

export default function Quarantine() {
  const qc = useQueryClient()
  const { data: entries, isLoading } = useQuery({
    queryKey: ['quarantine'],
    queryFn: fetchQuarantine,
  })

  const restore = useMutation({
    mutationFn: restoreQuarantine,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quarantine'] }),
  })
  const approve = useMutation({
    mutationFn: approveRemediation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quarantine'] }),
  })

  const [integrityChecked, setIntegrityChecked] = useState(false)
  const { data: integrity, refetch: checkIntegrity, isFetching: integrityLoading } = useQuery({
    queryKey: ['auditIntegrity'],
    queryFn: verifyAuditIntegrity,
    enabled: false,
  })

  function handleCheckIntegrity() {
    setIntegrityChecked(true)
    checkIntegrity()
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader no="05" title="Quarantine" description="Records pulled from circulation pending review" />

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Quarantine entries */}
        <div className="flex-1 space-y-3 min-w-0">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="card p-5 space-y-3">
                  <div className="shimmer h-4 w-3/4" />
                  <div className="shimmer h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : !entries?.length ? (
            <div className="card flex h-48 items-center justify-center">
              <div className="text-center">
                <ShieldAlert size={28} className="mx-auto text-ledger-outline" />
                <p className="mt-2 text-sm text-ledger-on-surface-variant">
                  No quarantined memories
                </p>
                <p className="mt-1 text-xs text-ledger-outline">
                  Memories with trust scores below 0.3 are automatically quarantined
                </p>
              </div>
            </div>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                className="card border-l-2 border-l-ledger-error p-5 transition-all hover:shadow-lifted hover:-translate-y-px"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Original content — impounded record */}
                    <p className="mono mb-1 text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">
                      Original Record
                    </p>
                    <div className="rounded-sharp border border-ledger-outline-variant bg-ledger-surface-low p-3">
                      <p className="mono leading-relaxed text-ledger-on-surface">
                        {e.original_content}
                      </p>
                    </div>

                    {/* Meta row */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <StatusBadge status={e.reason} />
                      <span className="mono text-[11px] tabular-nums text-ledger-on-surface-variant">
                        Trust was {Math.round(e.original_trust_score * 100)}%
                      </span>
                      <span className="text-ledger-outline-variant">|</span>
                      <span className="mono text-[11px] text-ledger-on-surface-variant">
                        {new Date(e.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Remediation suggestion */}
                    {e.remediated_content && (
                      <div className="mt-3 rounded-sharp border border-ledger-outline-variant bg-ledger-surface-low p-3">
                        <p className="mono mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ledger-secondary">
                          Suggested Fix
                        </p>
                        <p className="mono leading-relaxed text-ledger-on-surface">{e.remediated_content}</p>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => restore.mutate(e.id)}
                      disabled={restore.isPending || approve.isPending}
                      className="btn-secondary text-xs"
                    >
                      <RotateCcw size={13} className={restore.isPending ? 'animate-spin' : ''} />
                      {restore.isPending ? 'Restoring...' : 'Restore'}
                    </button>
                    {e.remediated_content && (
                      <button
                        onClick={() => approve.mutate(e.id)}
                        disabled={restore.isPending || approve.isPending}
                        className="btn-primary text-xs"
                      >
                        <Check size={13} /> {approve.isPending ? 'Approving...' : 'Approve Fix'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Integrity Gauge Sidebar */}
        <div className="w-full lg:w-56 shrink-0">
          <div className="card p-5 flex flex-col items-center gap-4">
            <h3 className="mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ledger-on-surface-variant">
              Audit Integrity
            </h3>

            {integrityChecked && integrity && !integrityLoading ? (
              <IntegrityGauge
                valid={integrity.valid}
                checked={integrity.entries_checked}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="relative h-24 w-24">
                  <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                    <circle
                      cx="50"
                      cy="50"
                      r={40}
                      fill="none"
                      className="stroke-ledger-surface-highest"
                      strokeWidth="6"
                    />
                    {integrityLoading && (
                      <circle
                        cx="50"
                        cy="50"
                        r={40}
                        fill="none"
                        className="stroke-ledger-primary animate-spin origin-center"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 40}
                        strokeDashoffset={2 * Math.PI * 40 * 0.75}
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ShieldAlert size={20} className="text-ledger-outline" />
                  </div>
                </div>
                <p className="mono text-[11px] text-ledger-on-surface-variant">Not yet verified</p>
              </div>
            )}

            <button
              onClick={handleCheckIntegrity}
              disabled={integrityLoading}
              className="btn-secondary text-xs w-full justify-center"
            >
              {integrityLoading ? 'Checking...' : 'Verify Chain'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
