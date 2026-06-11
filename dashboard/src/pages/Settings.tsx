import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchHealth, fetchSettings, updateSettings, resetSettings,
  regenerateApiKey, fetchApiKeyInfo, fetchMemoryStats, fetchConnectors, setAnthropicKey,
} from '../api/client'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import ErrorBanner from '../components/ErrorBanner'
import { useToast } from '../components/Toast'
import {
  Gauge, Save, RotateCcw, Check, Key, Copy, RefreshCw, BrainCircuit,
  AlertTriangle, Server, Database, Wifi, Brain, Plug, Trash2,
} from 'lucide-react'

const VALIDATION_FIELDS: Record<string, { label: string; desc: string; min: number; max: number; step: number; unit: string; group: 'threshold' | 'rate' }> = {
  trust_flag_threshold:        { label: 'Trust Flag Threshold',    desc: 'Memories below this are auto-flagged',        min: 0,  max: 1,    step: 0.05, unit: '',        group: 'threshold' },
  quarantine_threshold:        { label: 'Quarantine Threshold',    desc: 'Memories below this are auto-quarantined',    min: 0,  max: 1,    step: 0.05, unit: '',        group: 'threshold' },
  max_validation_batch:        { label: 'Max Validation Batch',    desc: 'Max memories per validation job',             min: 1,  max: 1000, step: 10,   unit: 'memories', group: 'rate' },
  source_fetch_timeout:        { label: 'Source Fetch Timeout',    desc: 'HTTP timeout for source re-fetch',            min: 1,  max: 120,  step: 1,    unit: 'seconds',  group: 'rate' },
  source_rate_limit_per_domain:{ label: 'Source Rate Limit',       desc: 'Max requests/sec per source domain',          min: 1,  max: 100,  step: 1,    unit: 'req/s',    group: 'rate' },
  llm_rate_limit_rpm:          { label: 'LLM Rate Limit',         desc: 'Max LLM calls per minute',                    min: 1,  max: 600,  step: 5,    unit: 'rpm',      group: 'rate' },
}

export default function Settings() {
  const qc = useQueryClient()
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: fetchHealth })
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: fetchSettings })
  const { data: settingsData, isLoading } = settingsQuery
  const { data: keyInfo } = useQuery({ queryKey: ['api-key-info'], queryFn: fetchApiKeyInfo })
  const { data: memStats } = useQuery({ queryKey: ['memory-stats'], queryFn: fetchMemoryStats })
  const { data: connectors } = useQuery({ queryKey: ['connectors'], queryFn: fetchConnectors })

  const [form, setForm] = useState<Record<string, number>>({})
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)

  const { toast } = useToast()
  const [anthropicKey, setAnthropicKeyInput] = useState('')
  const hasLlmKey = settingsData?.anthropic_key_configured ?? false

  const saveAnthropicKey = useMutation({
    mutationFn: () => setAnthropicKey(anthropicKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setAnthropicKeyInput('')
      toast('Anthropic API key saved. LLM strategies are now available.', 'success')
    },
    onError: (e) => toast((e as Error).message, 'error'),
  })

  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (settingsData && !initialized) {
      setForm(settingsData.settings)
      setInitialized(true)
    }
  }, [settingsData, initialized])

  const save = useMutation({
    mutationFn: () => updateSettings(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })
  const reset = useMutation({
    mutationFn: resetSettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setInitialized(false) },
  })
  const regenKey = useMutation({
    mutationFn: regenerateApiKey,
    onSuccess: (data) => { setNewKey(data.api_key); setShowRegenConfirm(false) },
  })

  const hasChanges = settingsData && JSON.stringify(form) !== JSON.stringify(settingsData.settings)
  const hasOverrides = settingsData && Object.keys(settingsData.overrides).length > 0

  const copyKey = async () => {
    if (newKey) { await navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }

  const thresholdFields = Object.entries(VALIDATION_FIELDS).filter(([, m]) => m.group === 'threshold')
  const rateFields = Object.entries(VALIDATION_FIELDS).filter(([, m]) => m.group === 'rate')

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        no="08"
        title="Settings"
        description="Thresholds, keys, and platform configuration"
        actions={
          <>
            {hasOverrides && (
              <button onClick={() => reset.mutate()} disabled={reset.isPending} className="btn-ghost text-xs">
                <RotateCcw size={13} /> Reset Defaults
              </button>
            )}
            <button onClick={() => save.mutate()} disabled={!hasChanges || save.isPending} className="btn-primary">
              {saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> {save.isPending ? 'Saving...' : 'Save Changes'}</>}
            </button>
          </>
        }
      />

      {settingsQuery.isError && (
        <ErrorBanner message={(settingsQuery.error as Error).message} onRetry={() => settingsQuery.refetch()} />
      )}

      {/* ── Service Status ── */}
      <div className="card">
        <SectionStrip icon={<Server size={13} />} title="Service Status" desc="Real-time health of platform components" />
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
          <StatusCard icon={<Database size={16} />} label="Database" status={health?.database ?? 'unknown'} />
          <StatusCard icon={<Wifi size={16} />} label="Redis" status={health?.redis ?? 'unknown'} />
          <StatusCard icon={<Server size={16} />} label="API" status={health?.status ?? 'unknown'} />
        </div>
      </div>

      {/* ── Tenant Overview ── */}
      <div className="card">
        <SectionStrip icon={<Brain size={13} />} title="Tenant Overview" desc="Your organization and resource usage" />
        <div className="grid grid-cols-2 gap-3 p-5 lg:grid-cols-4">
          <InfoCard label="Tenant" value={keyInfo?.tenant_name ?? 'Demo Tenant'} />
          <InfoCard label="Total Memories" value={String(memStats?.total ?? 0)} accentClass="text-ledger-primary" />
          <InfoCard label="Connectors" value={String(connectors?.length ?? 0)} accentClass="text-ledger-secondary" />
          <InfoCard
            label="Avg Trust"
            value={memStats ? `${Math.round(memStats.avg_trust_score * 100)}%` : '-'}
            accentClass={memStats && memStats.avg_trust_score >= 0.7 ? 'text-ledger-secondary' : 'text-ledger-tertiary'}
          />
        </div>
      </div>

      {/* ── Validation Thresholds ── */}
      <div className="card">
        <SectionStrip icon={<Gauge size={13} />} title="Validation Thresholds" desc="Control when memories are flagged or quarantined" />
        {isLoading ? (
          <div className="space-y-4 p-5">{[...Array(2)].map((_, i) => <div key={i} className="shimmer h-20" />)}</div>
        ) : (
          <div>
            {thresholdFields.map(([key, meta]) => {
              const value = form[key] ?? 0
              const isDefault = settingsData?.defaults[key] === value
              const pct = Math.round(value * 100)
              const barClass = value >= 0.5 ? 'bg-ledger-secondary' : value >= 0.3 ? 'bg-ledger-tertiary' : 'bg-ledger-error'
              const textClass = value >= 0.5 ? 'text-ledger-secondary' : value >= 0.3 ? 'text-ledger-tertiary' : 'text-ledger-error'
              return (
                <div key={key} className="border-b border-ledger-outline-variant px-5 py-4 last:border-b-0">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-ledger-on-surface">{meta.label}</p>
                      {!isDefault && <CustomBadge />}
                    </div>
                    <span className={`font-headline text-lg font-semibold tabular-nums ${textClass}`}>{pct}%</span>
                  </div>
                  <p className="mb-3 text-xs text-ledger-on-surface-variant">{meta.desc}</p>
                  {/* Inked slider track */}
                  <div className="relative h-2 overflow-hidden rounded-full border border-ledger-outline-variant bg-ledger-surface-highest">
                    <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${barClass}`} style={{ width: `${pct}%` }} />
                  </div>
                  <input
                    type="range" min={meta.min} max={meta.max} step={meta.step} value={value}
                    onChange={(e) => setForm({ ...form, [key]: parseFloat(e.target.value) })}
                    className="w-full mt-1 opacity-0 h-2 cursor-pointer absolute"
                    style={{ position: 'relative' }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Rate Limits & Performance ── */}
      <div className="card">
        <SectionStrip icon={<Gauge size={13} />} title="Rate Limits & Performance" desc="Control API call frequency and batch sizes" />
        {isLoading ? (
          <div className="space-y-4 p-5">{[...Array(4)].map((_, i) => <div key={i} className="shimmer h-14" />)}</div>
        ) : (
          <div>
            {rateFields.map(([key, meta]) => {
              const value = form[key] ?? 0
              const isDefault = settingsData?.defaults[key] === value
              return (
                <div key={key} className="flex items-center gap-6 border-b border-ledger-outline-variant px-5 py-3.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-ledger-on-surface">{meta.label}</p>
                      {!isDefault && <CustomBadge />}
                    </div>
                    <p className="mt-0.5 text-xs text-ledger-on-surface-variant">{meta.desc}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <input
                      type="number" min={meta.min} max={meta.max} step={meta.step} value={value}
                      onChange={(e) => setForm({ ...form, [key]: parseInt(e.target.value) || 0 })}
                      className="input-field w-20 text-center font-mono text-xs"
                    />
                    <span className="mono w-14 text-[10px] uppercase tracking-[0.09em] text-ledger-on-surface-variant">{meta.unit}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── API Key Management ── */}
      <div className="card">
        <SectionStrip icon={<Key size={13} />} title="API Key" desc="Authenticate API requests and integrations" />
        <div className="p-5">
          {/* New key success banner */}
          {newKey && (
            <div className="mb-4 flex items-start gap-3 rounded-sharp border border-ledger-secondary/40 bg-ledger-secondary/[0.07] px-4 py-3">
              <Check size={16} className="mt-0.5 shrink-0 text-ledger-secondary" />
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-medium text-ledger-secondary">New API key generated — copy it now</p>
                <code className="mono block w-full break-all rounded-sharp border border-ledger-outline-variant bg-ledger-surface-lowest px-3 py-2 text-xs text-ledger-secondary">
                  {newKey}
                </code>
              </div>
              <button onClick={copyKey} className="btn-ghost shrink-0 text-xs">
                {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="mono flex-1 rounded-sharp border border-ledger-outline-variant bg-ledger-surface-lowest px-3 py-2.5 text-sm text-ledger-on-surface-variant">
              {keyInfo?.key_hash_prefix ?? '••••••••••••...'}
            </div>
            <button onClick={() => setShowRegenConfirm(true)} className="btn-danger shrink-0 text-xs">
              <RefreshCw size={13} /> Regenerate
            </button>
          </div>

          {showRegenConfirm && (
            <div className="mt-3 flex items-start gap-3 rounded-sharp border border-ledger-error/40 bg-ledger-error-container/60 px-4 py-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ledger-error" />
              <div className="flex-1">
                <p className="text-xs font-medium text-ledger-error">This invalidates your current key immediately.</p>
                <p className="mb-3 mt-0.5 text-xs text-ledger-on-surface-variant">All integrations using it will stop working.</p>
                <div className="flex gap-2">
                  <button onClick={() => regenKey.mutate()} disabled={regenKey.isPending} className="btn-danger text-xs">
                    {regenKey.isPending ? 'Generating...' : 'Confirm Regenerate'}
                  </button>
                  <button onClick={() => setShowRegenConfirm(false)} className="btn-ghost text-xs">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── LLM Configuration ── */}
      <div className="card">
        <SectionStrip icon={<BrainCircuit size={13} />} title="LLM Configuration" desc="Anthropic API key for AI-powered validation strategies" />
        <div className="p-5">
          {hasLlmKey ? (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-sharp border border-ledger-secondary/40 bg-ledger-secondary/[0.07]">
                <Check size={15} className="text-ledger-secondary" />
              </div>
              <div>
                <p className="text-sm font-medium text-ledger-secondary">Anthropic key configured</p>
                <p className="text-xs text-ledger-on-surface-variant">Semantic Drift and Causal Chain strategies are available.</p>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-1 text-sm text-ledger-on-surface">Enter your Anthropic API key</p>
              <p className="mb-4 text-xs text-ledger-on-surface-variant">Required for Semantic Drift and Causal Chain validation strategies. Get a key at anthropic.com.</p>
              <div className="flex gap-3">
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKeyInput(e.target.value)}
                  placeholder="sk-ant-..."
                  className="input-field flex-1 font-mono"
                />
                <button
                  type="button"
                  onClick={() => saveAnthropicKey.mutate()}
                  disabled={!anthropicKey || anthropicKey.length < 10 || saveAnthropicKey.isPending}
                  className="btn-primary shrink-0"
                >
                  {saveAnthropicKey.isPending ? 'Saving...' : 'Save Key'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Danger Zone ── */}
      <div className="card border-ledger-error/50">
        <SectionStrip icon={<AlertTriangle size={13} />} title="Danger Zone" desc="Irreversible actions" danger />
        <DangerRow
          icon={<Trash2 size={14} />}
          title="Purge Audit Logs"
          desc="Delete all audit trail entries. Chain integrity will reset."
          action="Purge"
        />
        <DangerRow
          icon={<Brain size={14} />}
          title="Delete All Memories"
          desc="Remove all tracked memories, validation results, and trust scores."
          action="Delete All"
        />
        <DangerRow
          icon={<Plug size={14} />}
          title="Disconnect All Systems"
          desc="Remove all connector configurations and stop syncing."
          action="Disconnect"
          last
        />
      </div>

      {/* Footer branding */}
      <div className="flex items-center gap-3 py-4">
        <img src="/icon.svg" alt="" className="h-7 w-7" />
        <span className="font-headline text-sm text-ledger-on-surface">
          mem<span className="text-ledger-secondary">guard</span>
        </span>
        <span className="mono text-xs text-ledger-on-surface-variant">v0.1.0</span>
      </div>
    </div>
  )
}

/* ── Reusable sub-components ── */

function SectionStrip({ icon, title, desc, danger }: { icon: React.ReactNode; title: string; desc: string; danger?: boolean }) {
  return (
    <div className={`card-header ${danger ? 'text-ledger-error' : ''}`}>
      {icon}
      <span>{title}</span>
      <span className="ml-auto hidden normal-case tracking-normal font-body font-normal text-[10px] text-ledger-outline sm:inline">
        {desc}
      </span>
    </div>
  )
}

function StatusCard({ icon, label, status }: { icon: React.ReactNode; label: string; status: string }) {
  const isHealthy = status === 'healthy'
  return (
    <div className="flex items-center gap-3 rounded-sharp border border-ledger-outline-variant bg-ledger-surface-low px-4 py-3">
      <div className={`flex h-8 w-8 items-center justify-center rounded-sharp bg-ledger-surface-high ${isHealthy ? 'text-ledger-secondary' : 'text-ledger-error'}`}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-ledger-on-surface">{label}</p>
      </div>
      <StatusBadge status={status} />
    </div>
  )
}

function InfoCard({ label, value, accentClass }: { label: string; value: string; accentClass?: string }) {
  return (
    <div className="rounded-sharp border border-ledger-outline-variant bg-ledger-surface-low px-4 py-3">
      <p className="mono text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">{label}</p>
      <p className={`mt-0.5 font-headline text-lg font-semibold tabular-nums ${accentClass ?? 'text-ledger-on-surface'}`}>{value}</p>
    </div>
  )
}

function CustomBadge() {
  return (
    <span className="stamp text-ledger-primary bg-ledger-primary/[0.07]">
      custom
    </span>
  )
}

function DangerRow({ icon, title, desc, action, last }: { icon: React.ReactNode; title: string; desc: string; action: string; last?: boolean }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div className={`flex items-center gap-4 px-5 py-3.5 ${last ? '' : 'border-b border-ledger-error/20'}`}>
      <div className="text-ledger-error">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ledger-on-surface">{title}</p>
        <p className="text-xs text-ledger-on-surface-variant">{desc}</p>
      </div>
      {confirm ? (
        <div className="flex shrink-0 gap-2">
          <button className="btn-danger text-xs">Confirm</button>
          <button onClick={() => setConfirm(false)} className="btn-ghost text-xs">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setConfirm(true)} className="btn-danger shrink-0 text-xs">{action}</button>
      )}
    </div>
  )
}
