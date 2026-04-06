const BASE = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// --- Health ---
export const fetchHealth = () => request<Record<string, string>>('/health')

// --- Connectors ---
export interface Connector {
  id: string
  tenant_id: string
  connector_type: string
  name: string
  config: Record<string, unknown>
  is_active: boolean
  last_sync_at: string | null
  created_at: string
  updated_at: string
}

export const fetchConnectors = () => request<Connector[]>('/api/v1/connectors')
export const createConnector = (body: { connector_type: string; name: string; config: Record<string, unknown> }) =>
  request<Connector>('/api/v1/connectors', { method: 'POST', body: JSON.stringify(body) })
export const deleteConnector = (id: string) =>
  request<void>(`/api/v1/connectors/${id}`, { method: 'DELETE' })
export const testConnector = (id: string) =>
  request<{ connected: boolean; memory_count?: number; error?: string }>(`/api/v1/connectors/${id}/test`, { method: 'POST' })
export const syncConnector = (id: string) =>
  request<{ status: string }>(`/api/v1/connectors/${id}/sync`, { method: 'POST' })

// --- Memories ---
export interface Memory {
  id: string
  connector_id: string
  external_id: string
  content: string
  fact_type: string | null
  source_metadata: Record<string, unknown>
  retrieval_count: number
  trust_score: number
  status: string
  last_validated_at: string | null
  validation_count: number
  created_at: string
  updated_at: string
}

export interface MemoryStats {
  total: number
  active: number
  flagged: number
  quarantined: number
  invalidated: number
  avg_trust_score: number
  fact_type_distribution: Record<string, number>
}

export const fetchMemories = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return request<Memory[]>(`/api/v1/memories${qs}`)
}
export const fetchMemoryStats = () => request<MemoryStats>('/api/v1/memories/stats')
export const fetchMemory = (id: string) => request<Memory>(`/api/v1/memories/${id}`)
export const fetchTrustHistory = (id: string) =>
  request<{ timestamp: string; previous_trust_score: number; new_trust_score: number; strategy: string; outcome: string }[]>(
    `/api/v1/memories/${id}/trust-history`,
  )

// --- Validations ---
export interface ValidationJob {
  id: string
  tenant_id: string
  connector_id: string | null
  job_type: string
  status: string
  priority: number
  progress: number
  total_memories: number
  validated_count: number
  flagged_count: number
  quarantined_count: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export const fetchValidations = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return request<ValidationJob[]>(`/api/v1/validations${qs}`)
}
export const createValidation = (body: { job_type: string; connector_id?: string; priority?: number }) =>
  request<ValidationJob>('/api/v1/validations', { method: 'POST', body: JSON.stringify(body) })
export const cancelValidation = (id: string) =>
  request<{ status: string }>(`/api/v1/validations/${id}/cancel`, { method: 'POST' })

// --- Quarantine ---
export interface QuarantineEntry {
  id: string
  memory_id: string
  reason: string
  original_content: string
  original_trust_score: number
  remediation_status: string
  remediated_content: string | null
  remediated_by: string | null
  remediated_at: string | null
  created_at: string
}

export const fetchQuarantine = () => request<QuarantineEntry[]>('/api/v1/quarantine')
export const restoreQuarantine = (id: string) =>
  request<{ status: string }>(`/api/v1/quarantine/${id}/restore`, { method: 'POST' })
export const approveRemediation = (id: string) =>
  request<{ status: string }>(`/api/v1/quarantine/${id}/approve-remediation`, { method: 'POST' })

// --- Analytics ---
export interface HealthScore {
  overall_score: number
  total_memories: number
  verified_pct: number
  flagged_count: number
  quarantined_count: number
  avg_trust_score: number
  oldest_unvalidated_days?: number
}

export interface StalenessEntry {
  fact_type: string
  avg_staleness_days: number | null
  staleness_rate: number | null
  sample_size: number
}

export const fetchHealthScore = () => request<HealthScore>('/api/v1/analytics/health-score')
export const fetchStalenessHeatmap = () => request<StalenessEntry[]>('/api/v1/analytics/staleness-heatmap')
export const fetchHighRisk = () =>
  request<{ id: string; content: string; trust_score: number; retrieval_count: number; fact_type: string; risk_score: number }[]>(
    '/api/v1/analytics/high-risk',
  )

// --- Audit ---
export interface AuditEntry {
  id: string
  event_type: string
  memory_id: string | null
  actor: string | null
  details: Record<string, unknown>
  checksum: string
  created_at: string
}

export const fetchAuditLogs = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return request<AuditEntry[]>(`/api/v1/audit${qs}`)
}
export const verifyAuditIntegrity = () =>
  request<{ valid: boolean; entries_checked: number; first_broken_index: number | null }>('/api/v1/audit/verify-integrity')

// --- Settings ---
export interface TenantSettings {
  settings: Record<string, number>
  defaults: Record<string, number>
  overrides: Record<string, number>
  anthropic_key_configured: boolean
}

export const fetchSettings = () => request<TenantSettings>('/api/v1/settings')
export const updateSettings = (body: Record<string, number>) =>
  request<TenantSettings>('/api/v1/settings', { method: 'PUT', body: JSON.stringify(body) })
export const resetSettings = () =>
  request<TenantSettings>('/api/v1/settings', { method: 'DELETE' })

// --- API Key Management ---
export const fetchApiKeyInfo = () =>
  request<{ key_hash_prefix: string; tenant_name: string; tenant_id: string }>('/api/v1/settings/api-key')
export const regenerateApiKey = () =>
  request<{ api_key: string; message: string }>('/api/v1/settings/api-key', { method: 'POST' })

// --- Anthropic Key ---
export const setAnthropicKey = (key: string) =>
  request<{ status: string; message: string }>('/api/v1/settings/anthropic-key', { method: 'PUT', body: JSON.stringify({ anthropic_key: key }) })
