import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchHealth, fetchSettings, updateSettings, resetSettings,
  regenerateApiKey, fetchApiKeyInfo, fetchMemoryStats, fetchConnectors, setAnthropicKey,
} from '../api/client'
import StatusBadge from '../components/StatusBadge'
import ErrorBanner from '../components/ErrorBanner'
import { useToast } from '../components/Toast'
import {
  Gauge, Save, RotateCcw, Check, Key, Copy, RefreshCw, BrainCircuit,
  AlertTriangle, Server, Database, Wifi, Brain, Plug, Trash2, Shield,
} from 'lucide-react'

const C = {
  surface: '#0b1326',
  surfaceLow: '#131b2e',
  surfaceContainer: '#171f33',
  surfaceHigh: '#222a3d',
  surfaceHighest: '#2d3449',
  primary: '#adc6ff',
  primaryBright: '#367ef2',
  secondary: '#4edea3',
  tertiary: '#ffb95f',
  error: '#ffb4ab',
  errorContainer: '#93000a',
  onSurface: '#dae2fd',
  onSurfaceVariant: '#c5c6cd',
  outline: '#8f9097',
}

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
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-headline text-2xl font-bold" style={{ color: C.onSurface }}>System Configuration</h1>
          <p className="mt-1 text-sm" style={{ color: C.outline }}>Manage platform settings, security, and integrations</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {hasOverrides && (
            <button onClick={() => reset.mutate()} disabled={reset.isPending} className="btn-ghost text-xs">
              <RotateCcw size={13} /> Reset Defaults
            </button>
          )}
          <button onClick={() => save.mutate()} disabled={!hasChanges || save.isPending} className="btn-primary">
            {saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> {save.isPending ? 'Saving...' : 'Save Changes'}</>}
          </button>
        </div>
      </div>

      {settingsQuery.isError && (
        <ErrorBanner message={(settingsQuery.error as Error).message} onRetry={() => settingsQuery.refetch()} />
      )}

      {/* ── Service Status ── */}
      <section>
        <SectionHeader icon={<Server size={15} />} color={C.primary} title="Service Status" desc="Real-time health of platform components" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatusCard icon={<Database size={16} />} label="Database" status={health?.database ?? 'unknown'} />
          <StatusCard icon={<Wifi size={16} />} label="Redis" status={health?.redis ?? 'unknown'} />
          <StatusCard icon={<Server size={16} />} label="API" status={health?.status ?? 'unknown'} />
        </div>
      </section>

      {/* ── Tenant Overview ── */}
      <section>
        <SectionHeader icon={<Brain size={15} />} color={C.secondary} title="Tenant Overview" desc="Your organization and resource usage" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <InfoCard label="Tenant" value={keyInfo?.tenant_name ?? 'Demo Tenant'} />
          <InfoCard label="Total Memories" value={String(memStats?.total ?? 0)} accent={C.primary} />
          <InfoCard label="Connectors" value={String(connectors?.length ?? 0)} accent={C.secondary} />
          <InfoCard label="Avg Trust" value={memStats ? `${Math.round(memStats.avg_trust_score * 100)}%` : '-'} accent={memStats && memStats.avg_trust_score >= 0.7 ? C.secondary : C.tertiary} />
        </div>
      </section>

      {/* ── Validation Thresholds ── */}
      <section>
        <SectionHeader icon={<Gauge size={15} />} color={C.primary} title="Validation Thresholds" desc="Control when memories are flagged or quarantined" />
        <div className="card">
          {isLoading ? (
            <div className="p-5 space-y-4">{[...Array(2)].map((_, i) => <div key={i} className="shimmer h-20 rounded-lg" />)}</div>
          ) : (
            <div>
              {thresholdFields.map(([key, meta]) => {
                const value = form[key] ?? 0
                const isDefault = settingsData?.defaults[key] === value
                const pct = Math.round(value * 100)
                const barColor = value >= 0.5 ? C.secondary : value >= 0.3 ? C.tertiary : C.error
                return (
                  <div key={key} className="px-5 py-4" style={{ borderBottom: `1px solid ${C.surfaceHigh}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium" style={{ color: C.onSurface }}>{meta.label}</p>
                        {!isDefault && <CustomBadge />}
                      </div>
                      <span className="font-headline text-lg font-bold tabular-nums" style={{ color: barColor }}>{pct}%</span>
                    </div>
                    <p className="text-xs mb-3" style={{ color: C.outline }}>{meta.desc}</p>
                    {/* Styled slider track */}
                    <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: C.surfaceHighest }}>
                      <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
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
      </section>

      {/* ── Rate Limits & Performance ── */}
      <section>
        <SectionHeader icon={<Gauge size={15} />} color={C.tertiary} title="Rate Limits & Performance" desc="Control API call frequency and batch sizes" />
        <div className="card">
          {isLoading ? (
            <div className="p-5 space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="shimmer h-14 rounded-lg" />)}</div>
          ) : (
            <div>
              {rateFields.map(([key, meta]) => {
                const value = form[key] ?? 0
                const isDefault = settingsData?.defaults[key] === value
                return (
                  <div key={key} className="flex items-center gap-6 px-5 py-3.5" style={{ borderBottom: `1px solid ${C.surfaceHigh}` }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium" style={{ color: C.onSurface }}>{meta.label}</p>
                        {!isDefault && <CustomBadge />}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: C.outline }}>{meta.desc}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number" min={meta.min} max={meta.max} step={meta.step} value={value}
                        onChange={(e) => setForm({ ...form, [key]: parseInt(e.target.value) || 0 })}
                        className="input-field w-20 text-center font-mono text-xs"
                      />
                      <span className="text-[11px] w-14" style={{ color: C.outline }}>{meta.unit}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── API Key Management ── */}
      <section>
        <SectionHeader icon={<Key size={15} />} color={C.primary} title="API Key" desc="Authenticate API requests and integrations" />
        <div className="card p-5">
          {/* New key success banner */}
          {newKey && (
            <div className="flex items-start gap-3 rounded-lg px-4 py-3 mb-4" style={{ backgroundColor: 'rgba(78, 222, 163, 0.08)' }}>
              <Check size={16} className="mt-0.5 shrink-0" style={{ color: C.secondary }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium mb-1" style={{ color: C.secondary }}>New API key generated — copy it now</p>
                <code className="block w-full rounded px-3 py-2 font-mono text-xs break-all" style={{ backgroundColor: C.surfaceLow, color: C.secondary }}>
                  {newKey}
                </code>
              </div>
              <button onClick={copyKey} className="btn-ghost text-xs shrink-0">
                {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex-1 rounded px-3 py-2.5 font-mono text-sm" style={{ backgroundColor: C.surfaceLow, color: C.onSurfaceVariant }}>
              {keyInfo?.key_hash_prefix ?? '••••••••••••...'}
            </div>
            <button onClick={() => setShowRegenConfirm(true)} className="btn-danger shrink-0 text-xs">
              <RefreshCw size={13} /> Regenerate
            </button>
          </div>

          {showRegenConfirm && (
            <div className="flex items-start gap-3 rounded-lg px-4 py-3 mt-3" style={{ backgroundColor: `rgba(147, 0, 10, 0.15)` }}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: C.error }} />
              <div className="flex-1">
                <p className="text-xs font-medium" style={{ color: C.error }}>This invalidates your current key immediately.</p>
                <p className="text-xs mt-0.5 mb-3" style={{ color: C.outline }}>All integrations using it will stop working.</p>
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
      </section>

      {/* ── LLM Configuration ── */}
      <section>
        <SectionHeader icon={<BrainCircuit size={15} />} color={C.primary} title="LLM Configuration" desc="Anthropic API key for AI-powered validation strategies" />
        <div className="card p-5">
          {hasLlmKey ? (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded" style={{ backgroundColor: `${C.secondary}15` }}>
                <Check size={15} style={{ color: C.secondary }} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: C.secondary }}>Anthropic key configured</p>
                <p className="text-xs" style={{ color: C.outline }}>Semantic Drift and Causal Chain strategies are available.</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm mb-1" style={{ color: C.onSurface }}>Enter your Anthropic API key</p>
              <p className="text-xs mb-4" style={{ color: C.outline }}>Required for Semantic Drift and Causal Chain validation strategies. Get a key at anthropic.com.</p>
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
      </section>

      {/* ── Danger Zone ── */}
      <section>
        <SectionHeader icon={<AlertTriangle size={15} />} color={C.error} title="Danger Zone" desc="Irreversible actions" />
        <div className="card" style={{ boxShadow: 'var(--shadow-ambient), inset 0 0 0 1px rgba(255, 180, 171, 0.1)' }}>
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
      </section>

      {/* Footer branding */}
      <div className="flex items-center gap-3 py-4">
        <img src="/icon.svg" alt="" className="h-7 w-7" />
        <span className="font-headline text-sm" style={{ color: '#c8d6e5' }}>
          mem<span style={{ color: '#4edea3' }}>guard</span>
        </span>
        <span className="text-xs" style={{ color: C.outline }}>v0.1.0</span>
      </div>
    </div>
  )
}

/* ── Reusable sub-components ── */

function SectionHeader({ icon, color, title, desc }: { icon: React.ReactNode; color: string; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="flex h-7 w-7 items-center justify-center rounded" style={{ backgroundColor: `${color}15`, color }}>{icon}</div>
      <div>
        <h2 className="text-sm font-semibold" style={{ color: C.onSurface }}>{title}</h2>
        <p className="text-[11px]" style={{ color: C.outline }}>{desc}</p>
      </div>
    </div>
  )
}

function StatusCard({ icon, label, status }: { icon: React.ReactNode; label: string; status: string }) {
  const isHealthy = status === 'healthy'
  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded" style={{ backgroundColor: C.surfaceHigh, color: isHealthy ? C.secondary : C.error }}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium" style={{ color: C.onSurface }}>{label}</p>
      </div>
      <StatusBadge status={status} />
    </div>
  )
}

function InfoCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: C.outline }}>{label}</p>
      <p className="font-headline text-lg font-bold mt-0.5" style={{ color: accent ?? C.onSurface }}>{value}</p>
    </div>
  )
}

function CustomBadge() {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${C.primary}15`, color: C.primary }}>
      custom
    </span>
  )
}

function DangerRow({ icon, title, desc, action, last }: { icon: React.ReactNode; title: string; desc: string; action: string; last?: boolean }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="flex items-center gap-4 px-5 py-3.5" style={last ? {} : { borderBottom: `1px solid ${C.surfaceHigh}` }}>
      <div style={{ color: C.error }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: C.onSurface }}>{title}</p>
        <p className="text-xs" style={{ color: C.outline }}>{desc}</p>
      </div>
      {confirm ? (
        <div className="flex gap-2 shrink-0">
          <button className="btn-danger text-xs">Confirm</button>
          <button onClick={() => setConfirm(false)} className="btn-ghost text-xs">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setConfirm(true)} className="btn-danger text-xs shrink-0">{action}</button>
      )}
    </div>
  )
}
