import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchQuarantine, restoreQuarantine, approveRemediation, verifyAuditIntegrity } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import { RotateCcw, Check, ShieldAlert, ShieldCheck } from 'lucide-react'

function IntegrityGauge({ valid, checked }: { valid: boolean; checked: number }) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const pct = valid ? 1 : 0.5
  const offset = circumference * (1 - pct)
  const color = valid ? '#4edea3' : '#ffb4ab'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#222a3d"
            strokeWidth="6"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000"
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
            <ShieldCheck size={20} className="text-[#4edea3]" />
          ) : (
            <ShieldAlert size={20} className="text-[#ffb4ab]" />
          )}
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold" style={{ color }}>
          {valid ? 'Chain Valid' : 'Chain Broken'}
        </p>
        <p className="text-[11px] text-obsidian-outline">{checked} entries checked</p>
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
      {/* Header */}
      <div>
        <h1 className="font-headline text-2xl font-bold text-obsidian-on-surface">Quarantine</h1>
        <p className="mt-1 text-sm text-obsidian-on-surface-variant">
          Review and manage quarantined memories
        </p>
      </div>

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
                <ShieldAlert size={28} className="mx-auto text-obsidian-outline" />
                <p className="mt-2 text-sm text-obsidian-on-surface-variant">
                  No quarantined memories
                </p>
                <p className="mt-1 text-xs text-obsidian-outline">
                  Memories with trust scores below 0.3 are automatically quarantined
                </p>
              </div>
            </div>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                className="card p-5 transition-colors hover:bg-obsidian-surface-high"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Original content */}
                    <p className="text-sm font-medium leading-relaxed text-obsidian-on-surface">
                      {e.original_content}
                    </p>

                    {/* Meta row */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={e.reason} />
                      <span className="text-[11px] text-obsidian-outline tabular-nums">
                        Trust was {Math.round(e.original_trust_score * 100)}%
                      </span>
                      <span className="text-obsidian-surface-highest">|</span>
                      <span className="text-[11px] text-obsidian-outline">
                        {new Date(e.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Remediation suggestion */}
                    {e.remediated_content && (
                      <div className="mt-3 rounded-sm bg-[#4edea3]/8 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4edea3] mb-1">
                          Suggested Fix
                        </p>
                        <p className="text-sm text-[#4edea3]/90">{e.remediated_content}</p>
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
            <h3 className="font-headline text-xs font-semibold uppercase tracking-wider text-obsidian-on-surface-variant">
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
                      stroke="#222a3d"
                      strokeWidth="6"
                    />
                    {integrityLoading && (
                      <circle
                        cx="50"
                        cy="50"
                        r={40}
                        fill="none"
                        stroke="#adc6ff"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 40}
                        strokeDashoffset={2 * Math.PI * 40 * 0.75}
                        className="animate-spin origin-center"
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ShieldAlert size={20} className="text-obsidian-outline" />
                  </div>
                </div>
                <p className="text-[11px] text-obsidian-outline">Not yet verified</p>
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
