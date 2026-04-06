import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { cancelValidation, createValidation, fetchValidations, fetchSettings } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import ErrorBanner from '../components/ErrorBanner'
import Pagination from '../components/Pagination'
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
      {/* Header */}
      <div>
        <h1 className="font-headline text-2xl font-bold text-obsidian-on-surface">Validations</h1>
        <p className="mt-1 text-sm text-obsidian-on-surface-variant">
          Run and monitor memory validation jobs
        </p>
      </div>

      {jobsQuery.isError && (
        <ErrorBanner message={(jobsQuery.error as Error).message} onRetry={() => jobsQuery.refetch()} />
      )}

      {/* LLM key banner */}
      {!hasLlmKey && (
        <div
          className="flex items-center gap-3 rounded-lg px-5 py-3.5"
          style={{ backgroundColor: 'rgba(173, 198, 255, 0.08)' }}
        >
          <Key size={16} style={{ color: '#adc6ff' }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: '#adc6ff' }}>
              Anthropic API key not configured
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#8f9097' }}>
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
              className={`card p-5 flex flex-col justify-between transition-colors ${locked ? 'opacity-60' : 'hover:bg-obsidian-surface-high'}`}
            >
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-obsidian-surface-highest">
                    <Icon size={18} className="text-obsidian-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-headline text-sm font-semibold text-obsidian-on-surface">
                      {s.label}
                    </h3>
                    {locked && (
                      <span className="flex items-center gap-1 text-[10px] mt-0.5" style={{ color: '#ffb95f' }}>
                        <Lock size={9} /> Requires Anthropic key
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-obsidian-on-surface-variant">
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
        <h2 className="font-headline text-sm font-semibold uppercase tracking-wider text-obsidian-on-surface-variant mb-4">
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
                <p className="text-sm font-medium text-obsidian-on-surface">
                  Run your first validation to check memory accuracy
                </p>
                <p className="mt-1 text-xs text-obsidian-on-surface-variant">
                  Pick a strategy above to start a validation job.
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-obsidian-outline">
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Progress</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Flagged</th>
                  <th className="px-5 py-3">Quarantined</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="table-row">
                    <td className="px-5 py-3 font-medium text-obsidian-on-surface">
                      {titleCase(j.job_type)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={j.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-24 rounded-full bg-obsidian-surface-highest overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              j.status === 'completed'
                                ? 'bg-[#4edea3]'
                                : j.status === 'failed'
                                  ? 'bg-[#ffb4ab]'
                                  : 'bg-[#adc6ff]'
                            }`}
                            style={{ width: `${j.progress * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] tabular-nums text-obsidian-outline">
                          {Math.round(j.progress * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-obsidian-on-surface-variant tabular-nums">
                      {j.total_memories}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          j.flagged_count > 0
                            ? 'font-medium text-[#ffb95f] tabular-nums'
                            : 'text-obsidian-outline tabular-nums'
                        }
                      >
                        {j.flagged_count}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          j.quarantined_count > 0
                            ? 'font-medium text-[#ffb4ab] tabular-nums'
                            : 'text-obsidian-outline tabular-nums'
                        }
                      >
                        {j.quarantined_count}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-obsidian-outline">
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
