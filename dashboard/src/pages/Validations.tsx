import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { cancelValidation, createValidation, fetchValidations, fetchSettings } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import ErrorBanner from '../components/ErrorBanner'
import Pagination from '../components/Pagination'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import { Globe, Layers, BrainCircuit, GitBranch, Play, X, Lock, Key } from 'lucide-react'
import { formatTimestamp, titleCase } from '../utils/time'

const STRATEGIES = [
  {
    key: 'source_linked',
    label: 'Source-Linked',
    icon: Globe,
    description: 'Re-fetch from the original source URL and compare against stored content.',
    needsLlm: false,
  },
  {
    key: 'cross_reference',
    label: 'Cross-Reference',
    icon: Layers,
    description: 'Verify facts against 2-3 independent external sources for majority consensus.',
    needsLlm: false,
  },
  {
    key: 'semantic_drift',
    label: 'Semantic Drift',
    icon: BrainCircuit,
    description: 'Use LLM inference to detect contradictions in recent agent context.',
    needsLlm: true,
  },
  {
    key: 'causal_chain',
    label: 'Causal Chain',
    icon: GitBranch,
    description: 'Find memory dependencies and cascade flags to related facts.',
    needsLlm: true,
  },
] as const

export default function Validations() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const pageSize = 20

  const jobsQuery = useQuery({
    queryKey: ['validations', page],
    queryFn: () => fetchValidations({ limit: String(pageSize), offset: String((page - 1) * pageSize) }),
  })
  const { data: jobs, isLoading } = jobsQuery
  const { data: settingsData } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings })
  const hasLlmKey = settingsData?.anthropic_key_configured ?? false

  const { toast } = useToast()

  const create = useMutation({
    mutationFn: (jobType: string) => createValidation({ job_type: jobType }),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['validations'] }); toast(`Validation job started: ${titleCase(data.job_type)}`, 'success') },
    onError: (e) => toast((e as Error).message, 'error'),
  })
  const cancel = useMutation({
    mutationFn: cancelValidation,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['validations'] }); toast('Job cancelled', 'info') },
    onError: (e) => toast((e as Error).message, 'error'),
  })

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader no="04" title="Validations" description="Run and monitor validation sweeps" />

      {jobsQuery.isError && (
        <ErrorBanner message={(jobsQuery.error as Error).message} onRetry={() => jobsQuery.refetch()} />
      )}

      {/* LLM key banner */}
      {!hasLlmKey && (
        <div className="flex items-center gap-3 rounded-sharp border border-ledger-primary/25 bg-ledger-primary/[0.06] px-5 py-3.5">
          <Key size={16} className="shrink-0 text-ledger-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium text-ledger-primary">
              Anthropic API key not configured
            </p>
            <p className="mt-0.5 text-xs text-ledger-on-surface-variant">
              Semantic Drift and Causal Chain strategies require an Anthropic key for LLM inference.
            </p>
          </div>
          <button type="button" onClick={() => navigate('/settings')} className="btn-primary text-xs shrink-0">
            <Key size={12} /> Add Key in Settings
          </button>
        </div>
      )}

      {/* Strategy Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STRATEGIES.map((s) => {
          const Icon = s.icon
          const locked = s.needsLlm && !hasLlmKey
          return (
            <div
              key={s.key}
              className={`card p-5 flex flex-col justify-between transition-all ${locked ? 'opacity-60' : 'hover:shadow-lifted hover:-translate-y-px'}`}
            >
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-sharp border border-ledger-outline-variant bg-ledger-surface-low">
                    <Icon size={18} className="text-ledger-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-headline text-sm font-semibold text-ledger-on-surface">
                      {s.label}
                    </h3>
                    {locked && (
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] text-ledger-tertiary">
                        <Lock size={9} /> Requires Anthropic key
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-ledger-on-surface-variant">
                  {s.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => locked ? navigate('/settings') : create.mutate(s.key)}
                disabled={!locked && (create.isPending || cancel.isPending)}
                className={locked ? 'btn-secondary mt-4 w-full justify-center text-xs' : 'btn-primary mt-4 w-full justify-center text-xs'}
              >
                {locked ? (
                  <><Lock size={12} /> Configure Key</>
                ) : create.isPending ? (
                  <><span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> Starting...</>
                ) : (
                  <><Play size={12} /> Run</>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Active Jobs */}
      <div>
        <h2 className="mono mb-4 text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">
          Validation Jobs
        </h2>

        <div className="card overflow-x-auto">
          {isLoading ? (
            <div className="space-y-0">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-4 px-5 py-4">
                  <div className="shimmer h-4 w-24" />
                  <div className="shimmer h-4 w-16" />
                  <div className="shimmer h-4 flex-1" />
                </div>
              ))}
            </div>
          ) : !jobs?.length ? (
            <div className="flex h-32 items-center justify-center">
              <div className="text-center">
                <p className="text-sm font-medium text-ledger-on-surface">
                  Run your first validation to check memory accuracy
                </p>
                <p className="mt-1 text-xs text-ledger-on-surface-variant">
                  Pick a strategy above to start a validation job.
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header mono text-left text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Progress</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Flagged</th>
                  <th className="px-5 py-3 font-medium">Quarantined</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="table-row">
                    <td className="px-5 py-3 font-medium text-ledger-on-surface">
                      {titleCase(j.job_type)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={j.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-[5px] w-24 overflow-hidden rounded-full border border-ledger-outline-variant bg-ledger-surface-lowest">
                          <div
                            className="h-full rounded-full bg-ledger-primary transition-all duration-500"
                            style={{ width: `${j.progress * 100}%` }}
                          />
                        </div>
                        <span className="mono text-[11px] tabular-nums text-ledger-on-surface-variant">
                          {Math.round(j.progress * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="mono px-5 py-3 text-xs tabular-nums text-ledger-on-surface-variant">
                      {j.total_memories}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          j.flagged_count > 0
                            ? 'mono text-xs font-semibold tabular-nums text-ledger-tertiary'
                            : 'mono text-xs tabular-nums text-ledger-outline'
                        }
                      >
                        {j.flagged_count}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          j.quarantined_count > 0
                            ? 'mono text-xs font-semibold tabular-nums text-ledger-error'
                            : 'mono text-xs tabular-nums text-ledger-outline'
                        }
                      >
                        {j.quarantined_count}
                      </span>
                    </td>
                    <td className="mono px-5 py-3 text-xs text-ledger-on-surface-variant">
                      {formatTimestamp(j.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      {(j.status === 'pending' || j.status === 'running') && (
                        <button
                          onClick={() => cancel.mutate(j.id)}
                          disabled={cancel.isPending}
                          className="btn-danger text-xs"
                        >
                          <X size={12} /> {cancel.isPending ? 'Cancelling...' : 'Cancel'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {jobs && jobs.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={jobs.length < pageSize ? (page - 1) * pageSize + jobs.length : (page + 1) * pageSize} onPageChange={setPage} />
        )}
      </div>
    </div>
  )
}
