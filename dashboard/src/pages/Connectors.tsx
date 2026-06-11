import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchConnectors, createConnector, deleteConnector, testConnector, syncConnector } from '../api/client'
import PageHeader from '../components/PageHeader'
import ErrorBanner from '../components/ErrorBanner'
import { useToast } from '../components/Toast'
import { Plug, RefreshCw, Zap, Plus, X, Trash2, Database } from 'lucide-react'
import { formatTimestamp } from '../utils/time'

type ConnectorType = 'mem0' | 'zep' | 'letta' | 'langmem' | 'generic_rest'

interface FormState {
  connector_type: ConnectorType
  name: string
  // Letta-specific
  letta_agent_id: string
  letta_base_url: string
  // LangMem-specific
  langmem_namespace: string
  langmem_base_url: string
  langmem_assistant_id: string
  // Mem0 / Zep shared fields
  api_key: string
  user_id: string
  agent_id: string
  // Zep-specific
  group_id: string
  zep_base_url: string
  // Generic REST fields
  base_url: string
  auth_header: string
  auth_value: string
  list_path: string
  list_response_key: string
  get_path: string
  update_path: string
}

const EMPTY_FORM: FormState = {
  connector_type: 'mem0',
  name: '',
  api_key: '',
  user_id: '',
  agent_id: '',
  group_id: '',
  zep_base_url: '',
  letta_agent_id: '',
  letta_base_url: '',
  langmem_namespace: 'memories',
  langmem_base_url: '',
  langmem_assistant_id: '',
  base_url: '',
  auth_header: 'Authorization',
  auth_value: '',
  list_path: '/memories',
  list_response_key: 'data',
  get_path: '/memories/{id}',
  update_path: '/memories/{id}',
}

const CONNECTOR_LABELS: Record<string, { label: string; desc: string }> = {
  mem0: { label: 'Mem0', desc: 'Cloud or self-hosted memory API' },
  zep: { label: 'Zep', desc: 'Knowledge graph with facts & episodes' },
  letta: { label: 'Letta', desc: 'Core + archival memory per agent' },
  langmem: { label: 'LangMem', desc: 'LangGraph Store with namespaced items' },
  generic_rest: { label: 'Generic REST', desc: 'Any REST API with custom endpoints' },
}

export default function Connectors() {
  const qc = useQueryClient()
  const connectorsQuery = useQuery({ queryKey: ['connectors'], queryFn: fetchConnectors })
  const { data: connectors, isLoading } = connectorsQuery
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })

  const { toast } = useToast()
  const [activeAction, setActiveAction] = useState<{ id: string; action: string } | null>(null)
  const [syncedIds, setSyncedIds] = useState<Set<string>>(new Set())

  const test = useMutation({
    mutationFn: (id: string) => { setActiveAction({ id, action: 'test' }); return testConnector(id) },
    onSuccess: (data) => {
      toast(data.connected ? `Connected! ${data.memory_count ?? 0} memories found.` : `Connection failed: ${data.error}`, data.connected ? 'success' : 'error')
      setActiveAction(null)
    },
    onError: (e) => { toast((e as Error).message, 'error'); setActiveAction(null) },
  })
  const sync = useMutation({
    mutationFn: (id: string) => { setActiveAction({ id, action: 'sync' }); return syncConnector(id) },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['connectors'] })
      setSyncedIds((prev) => new Set(prev).add(id))
      toast('Sync queued successfully', 'success')
      setActiveAction(null)
    },
    onError: (e) => { toast((e as Error).message, 'error'); setActiveAction(null) },
  })
  const remove = useMutation({
    mutationFn: deleteConnector,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['connectors'] }); toast('Connector deleted', 'info') },
    onError: (e) => toast((e as Error).message, 'error'),
  })

  const create = useMutation({
    mutationFn: () => {
      let config: Record<string, unknown>
      if (form.connector_type === 'mem0') {
        config = {
          api_key: form.api_key,
          ...(form.user_id && { user_id: form.user_id }),
          ...(form.agent_id && { agent_id: form.agent_id }),
        }
      } else if (form.connector_type === 'zep') {
        config = {
          api_key: form.api_key,
          ...(form.user_id && { user_id: form.user_id }),
          ...(form.group_id && { group_id: form.group_id }),
          ...(form.zep_base_url && { base_url: form.zep_base_url }),
        }
      } else if (form.connector_type === 'letta') {
        config = {
          api_key: form.api_key,
          ...(form.letta_agent_id && { agent_id: form.letta_agent_id }),
          ...(form.letta_base_url && { base_url: form.letta_base_url }),
        }
      } else if (form.connector_type === 'langmem') {
        const ns = form.langmem_namespace.split(',').map((s) => s.trim()).filter(Boolean)
        config = {
          api_key: form.api_key,
          namespace: ns.length ? ns : ['memories'],
          ...(form.langmem_base_url && { base_url: form.langmem_base_url }),
          ...(form.langmem_assistant_id && { assistant_id: form.langmem_assistant_id }),
        }
      } else {
        config = {
          base_url: form.base_url,
          ...(form.auth_value && { auth_header: form.auth_header, auth_value: form.auth_value }),
          endpoints: {
            list: { method: 'GET', path: form.list_path, response_key: form.list_response_key || undefined },
            get: { method: 'GET', path: form.get_path },
            update: { method: 'PUT', path: form.update_path },
          },
        }
      }
      return createConnector({ connector_type: form.connector_type, name: form.name, config })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connectors'] })
      setShowForm(false)
      setForm({ ...EMPTY_FORM })
    },
  })

  const set = (key: keyof FormState, val: string) => setForm((f) => ({ ...f, [key]: val }))
  const canSubmit = form.name && (
    form.connector_type === 'mem0' ? (form.api_key && form.user_id)
      : form.connector_type === 'generic_rest' ? form.base_url
      : form.api_key
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        no="07"
        title="Connectors"
        description="Registered memory systems under watch"
        actions={!showForm ? (
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus size={14} /> Add Connector
          </button>
        ) : undefined}
      />

      {connectorsQuery.isError && (
        <ErrorBanner message={(connectorsQuery.error as Error).message} onRetry={() => connectorsQuery.refetch()} />
      )}

      {/* Connector cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => <div key={i} className="shimmer h-48" />)}
        </div>
      ) : !connectors?.length && !showForm ? (
        <div className="card flex h-56 items-center justify-center">
          <div className="max-w-xs text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-ledger-outline-variant bg-ledger-primary/[0.06]">
              <Plug size={28} className="text-ledger-primary" />
            </div>
            <p className="mt-4 text-sm font-medium text-ledger-on-surface">
              Connect your first memory system to start validating
            </p>
            <p className="mt-1 text-xs text-ledger-on-surface-variant">
              MemGuard supports Mem0, Zep, Letta, LangMem, and custom REST APIs.
            </p>
            <button onClick={() => setShowForm(true)} className="btn-primary mt-5">
              <Plus size={14} /> Add Your First Connector
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {connectors?.map((c) => {
            const meta = CONNECTOR_LABELS[c.connector_type] ?? { label: c.connector_type, desc: '' }
            return (
              <div key={c.id} className="card flex flex-col justify-between p-5">
                {/* Top section */}
                <div>
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-sharp border border-ledger-outline-variant bg-ledger-primary/[0.06]">
                        <Plug size={18} className="text-ledger-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-ledger-on-surface">{c.name}</p>
                        <span className="mono mt-0.5 inline-block rounded-sharp border border-ledger-outline-variant bg-ledger-surface-high px-2 py-0.5 text-[10px] uppercase tracking-[0.09em] text-ledger-on-surface-variant">
                          {meta.label}
                        </span>
                      </div>
                    </div>
                    {/* Status stamp */}
                    <span
                      className={`stamp animate-stamp-in mt-1 ${
                        c.is_active
                          ? 'text-ledger-secondary bg-ledger-secondary/[0.07]'
                          : 'text-ledger-on-surface-variant bg-ledger-surface-high'
                      }`}
                    >
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="mt-4 flex items-center gap-4">
                    {c.last_sync_at && (
                      <div className="flex items-center gap-1.5">
                        <RefreshCw size={12} className="text-ledger-outline" />
                        <span className="mono text-xs text-ledger-on-surface-variant">
                          {formatTimestamp(c.last_sync_at)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Database size={12} className={(c.last_sync_at || syncedIds.has(c.id)) ? 'text-ledger-secondary' : 'text-ledger-outline'} />
                      <span className={`text-xs ${(c.last_sync_at || syncedIds.has(c.id)) ? 'text-ledger-secondary' : 'text-ledger-on-surface-variant'}`}>
                        {syncedIds.has(c.id) ? 'Sync queued' : c.last_sync_at ? 'Synced' : 'Not synced'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-ledger-outline-variant pt-4">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); test.mutate(c.id) }}
                    disabled={activeAction?.id === c.id}
                    className="btn-ghost justify-center text-xs"
                  >
                    {activeAction?.id === c.id && activeAction.action === 'test'
                      ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> Testing...</>
                      : <><Zap size={13} /> Test</>}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); sync.mutate(c.id) }}
                    disabled={activeAction?.id === c.id}
                    className="btn-ghost justify-center text-xs"
                  >
                    {activeAction?.id === c.id && activeAction.action === 'sync'
                      ? <><RefreshCw size={13} className="animate-spin" /> Syncing...</>
                      : <><RefreshCw size={13} /> Sync</>}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); if (confirm('Delete this connector?')) remove.mutate(c.id) }}
                    disabled={activeAction?.id === c.id}
                    className="btn-ghost justify-center text-xs text-ledger-error hover:text-ledger-error"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Creation form panel */}
      {showForm && (
        <div className="card animate-slide-up">
          <div className="card-header justify-between">
            <span>New Connector</span>
            <button onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }) }} className="text-ledger-outline transition-colors hover:text-ledger-on-surface">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-5 p-5">
            {/* Type selector */}
            <fieldset disabled={create.isPending} className="space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {([
                { type: 'mem0' as const, label: 'Mem0', desc: 'Cloud or self-hosted memory API' },
                { type: 'zep' as const, label: 'Zep', desc: 'Knowledge graph with facts & episodes' },
                { type: 'letta' as const, label: 'Letta', desc: 'Core + archival memory per agent' },
                { type: 'langmem' as const, label: 'LangMem', desc: 'LangGraph Store with namespaced items' },
                { type: 'generic_rest' as const, label: 'Generic REST', desc: 'Any REST API with custom endpoints' },
              ]).map(({ type, label, desc }) => (
                <button
                  key={type}
                  onClick={() => set('connector_type', type)}
                  className={`rounded-sharp border p-4 text-left transition-all ${
                    form.connector_type === type
                      ? 'border-ledger-primary bg-ledger-primary/[0.06] shadow-[inset_0_0_0_1px_#23408e]'
                      : 'border-ledger-outline-variant bg-ledger-surface-low hover:border-ledger-outline'
                  }`}
                >
                  <p className="text-sm font-semibold text-ledger-on-surface">{label}</p>
                  <p className="mt-0.5 text-xs text-ledger-on-surface-variant">{desc}</p>
                </button>
              ))}
            </div>

            {/* Name */}
            <Field label="Connector Name" required>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Production Mem0" className="input-field w-full" />
            </Field>

            {/* Mem0 fields */}
            {form.connector_type === 'mem0' && (
              <>
                <Field label="API Key" required>
                  <input value={form.api_key} onChange={(e) => set('api_key', e.target.value)} type="password" placeholder="m0-..." className="input-field w-full font-mono" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="User ID" required hint="Required by Mem0 API">
                    <input value={form.user_id} onChange={(e) => set('user_id', e.target.value)} placeholder="user-123" className="input-field w-full" />
                  </Field>
                  <Field label="Agent ID" hint="Optional filter">
                    <input value={form.agent_id} onChange={(e) => set('agent_id', e.target.value)} placeholder="agent-456" className="input-field w-full" />
                  </Field>
                </div>
              </>
            )}

            {/* Zep fields */}
            {form.connector_type === 'zep' && (
              <>
                <Field label="API Key" required>
                  <input value={form.api_key} onChange={(e) => set('api_key', e.target.value)} type="password" placeholder="z_..." className="input-field w-full font-mono" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="User ID" hint="Scope graph search to a user">
                    <input value={form.user_id} onChange={(e) => set('user_id', e.target.value)} placeholder="user-123" className="input-field w-full" />
                  </Field>
                  <Field label="Group ID" hint="For shared/group graphs">
                    <input value={form.group_id} onChange={(e) => set('group_id', e.target.value)} placeholder="group-456" className="input-field w-full" />
                  </Field>
                </div>
                <Field label="Base URL" hint="Leave blank for Zep Cloud">
                  <input value={form.zep_base_url} onChange={(e) => set('zep_base_url', e.target.value)} placeholder="https://api.getzep.com/api/v2 (default)" className="input-field w-full font-mono text-xs" />
                </Field>
                <InfoNote>
                  Zep stores memories as a knowledge graph. MemGuard will fetch <Em>graph edges</Em> (facts) and <Em>threads</Em> for validation. Writeback is not supported -- trust scores are tracked in MemGuard only.
                </InfoNote>
              </>
            )}

            {/* LangMem fields */}
            {form.connector_type === 'langmem' && (
              <>
                <Field label="API Key" required hint="LangSmith or LangGraph Platform key">
                  <input value={form.api_key} onChange={(e) => set('api_key', e.target.value)} type="password" placeholder="lsv2_..." className="input-field w-full font-mono" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Namespace" hint="Comma-separated, e.g. user-123, memories">
                    <input value={form.langmem_namespace} onChange={(e) => set('langmem_namespace', e.target.value)} placeholder="memories" className="input-field w-full font-mono" />
                  </Field>
                  <Field label="Assistant ID" hint="LangGraph deployment (optional)">
                    <input value={form.langmem_assistant_id} onChange={(e) => set('langmem_assistant_id', e.target.value)} placeholder="asst-xxx" className="input-field w-full font-mono" />
                  </Field>
                </div>
                <Field label="Base URL" hint="Leave blank for LangSmith hosted">
                  <input value={form.langmem_base_url} onChange={(e) => set('langmem_base_url', e.target.value)} placeholder="https://api.smith.langchain.com (default)" className="input-field w-full font-mono text-xs" />
                </Field>
                <InfoNote>
                  LangMem uses LangGraph's Store layer. Memories are <Em>namespaced items</Em> with key-value pairs. MemGuard fetches via the Store REST API and can write trust scores back into item values.
                </InfoNote>
              </>
            )}

            {/* Letta fields */}
            {form.connector_type === 'letta' && (
              <>
                <Field label="API Key" required>
                  <input value={form.api_key} onChange={(e) => set('api_key', e.target.value)} type="password" placeholder="sk-..." className="input-field w-full font-mono" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Agent ID" hint="Leave blank to fetch from all agents">
                    <input value={form.letta_agent_id} onChange={(e) => set('letta_agent_id', e.target.value)} placeholder="agent-xxx" className="input-field w-full font-mono" />
                  </Field>
                  <Field label="Base URL" hint="Leave blank for Letta Cloud">
                    <input value={form.letta_base_url} onChange={(e) => set('letta_base_url', e.target.value)} placeholder="https://api.letta.com/v1 (default)" className="input-field w-full font-mono text-xs" />
                  </Field>
                </div>
                <InfoNote>
                  Letta organizes memory per-agent. MemGuard fetches <Em>core memory blocks</Em> (persona, human, custom) and <Em>archival passages</Em> (long-term vector store). Core memory blocks support writeback.
                </InfoNote>
              </>
            )}

            {/* Generic REST fields */}
            {form.connector_type === 'generic_rest' && (
              <>
                <Field label="Base URL" required>
                  <input value={form.base_url} onChange={(e) => set('base_url', e.target.value)} placeholder="https://my-memory-api.com/v1" className="input-field w-full font-mono" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Auth Header">
                    <input value={form.auth_header} onChange={(e) => set('auth_header', e.target.value)} placeholder="Authorization" className="input-field w-full" />
                  </Field>
                  <Field label="Auth Value">
                    <input value={form.auth_value} onChange={(e) => set('auth_value', e.target.value)} type="password" placeholder="Bearer ..." className="input-field w-full font-mono" />
                  </Field>
                </div>
                <p className="mono pt-2 text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">Endpoint Configuration</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="List Path" hint="GET endpoint for listing memories">
                    <input value={form.list_path} onChange={(e) => set('list_path', e.target.value)} placeholder="/memories" className="input-field w-full font-mono text-xs" />
                  </Field>
                  <Field label="Response Key" hint="JSON key containing the array">
                    <input value={form.list_response_key} onChange={(e) => set('list_response_key', e.target.value)} placeholder="data" className="input-field w-full font-mono text-xs" />
                  </Field>
                  <Field label="Get Path" hint="Use {id} as placeholder">
                    <input value={form.get_path} onChange={(e) => set('get_path', e.target.value)} placeholder="/memories/{id}" className="input-field w-full font-mono text-xs" />
                  </Field>
                  <Field label="Update Path" hint="PUT endpoint for writeback">
                    <input value={form.update_path} onChange={(e) => set('update_path', e.target.value)} placeholder="/memories/{id}" className="input-field w-full font-mono text-xs" />
                  </Field>
                </div>
              </>
            )}

            </fieldset>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-ledger-outline-variant pt-4">
              {create.error && (
                <span className="mr-auto text-xs text-ledger-error">{(create.error as Error).message}</span>
              )}
              <button onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }) }} className="btn-secondary">
                Cancel
              </button>
              <button onClick={() => create.mutate()} disabled={!canSubmit || create.isPending} className="btn-primary">
                <Plus size={14} /> {create.isPending ? 'Creating...' : 'Create Connector'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ledger-on-surface-variant">
        {label}
        {required && <span className="ml-0.5 text-ledger-error">*</span>}
      </span>
      {hint && <span className="ml-2 text-[11px] text-ledger-outline">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-sharp border border-ledger-outline-variant bg-ledger-surface-low px-4 py-3">
      <p className="text-xs text-ledger-on-surface-variant">{children}</p>
    </div>
  )
}

function Em({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-ledger-primary">{children}</span>
}
