# MemGuard: AI Agent Memory Validation Platform

## Project Overview

MemGuard is a **memory-system-agnostic validation layer** that continuously verifies whether facts stored in AI agent memory systems are still true. It sits alongside memory systems (Mem0, Letta, Engram, Zep, raw vector DBs) as a sidecar service — it does NOT replace them.

**Core insight:** Current memory systems decay memories by access frequency or TTL timers. But a highly-retrieved memory about a user's employer is highly relevant until it's not — at which point it becomes *confidently wrong* rather than just outdated. MemGuard proactively detects this.

**Analogy:** MemGuard is to agent memory what Datadog is to databases — it monitors, validates, and alerts, but doesn't own the data.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    MemGuard Platform                 │
│                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Connector │  │  Validation  │  │   Trust Score  │ │
│  │  Layer    │──│  Engine      │──│   Calculator   │ │
│  └──────────┘  └──────────────┘  └───────────────┘ │
│       │              │                    │         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Scheduler│  │  Quarantine  │  │  Audit Trail   │ │
│  │          │  │  Manager     │  │  Logger        │ │
│  └──────────┘  └──────────────┘  └───────────────┘ │
│                      │                              │
│  ┌──────────────────────────────────────────────┐   │
│  │              API Layer (FastAPI)              │   │
│  │  REST API  |  MCP Server  |  Webhook Emitter │   │
│  └──────────────────────────────────────────────┘   │
│                      │                              │
│  ┌──────────────────────────────────────────────┐   │
│  │           Dashboard (React + Tailwind)        │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │                          │
    ┌────┴────┐               ┌────┴────┐
    │  Mem0   │               │  Letta  │  ... (any memory system)
    │  API    │               │  API    │
    └─────────┘               └─────────┘
```

---

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Backend API | Python 3.12 + FastAPI | Async-first, ecosystem compatibility with AI/ML tools |
| Database | PostgreSQL 16 | Validation jobs, audit logs, trust scores, config |
| Cache/Queue | Redis 7 | Job scheduling, rate limiting, caching validation results |
| Task Queue | Celery with Redis broker | Background validation jobs, periodic scheduling |
| ORM | SQLAlchemy 2.0 + Alembic | Type-safe models, migrations |
| LLM Calls | Anthropic SDK (Claude Sonnet) | Semantic staleness assessment |
| Dashboard | React 18 + Tailwind CSS + Vite | Lightweight, fast to build |
| MCP Server | Python MCP SDK | Agent-native integration |
| Containerization | Docker + docker-compose | Local dev and deployment |
| Testing | pytest + pytest-asyncio | Async test support |

---

## Project Structure

```
memguard/
├── CLAUDE.md                    # This file
├── docker-compose.yml           # PostgreSQL, Redis, API, Worker, Dashboard
├── Dockerfile                   # Multi-stage build for API + Worker
├── pyproject.toml               # Python dependencies
├── alembic.ini                  # Migration config
├── alembic/
│   └── versions/                # Database migrations
│
├── src/
│   ├── __init__.py
│   ├── main.py                  # FastAPI app entry point
│   ├── config.py                # Settings via pydantic-settings (env vars)
│   │
│   ├── models/                  # SQLAlchemy models
│   │   ├── __init__.py
│   │   ├── base.py              # Base model with id, created_at, updated_at
│   │   ├── memory_record.py     # Tracked memory with source metadata
│   │   ├── validation_job.py    # Validation job state machine
│   │   ├── validation_result.py # Individual validation outcomes
│   │   ├── trust_score.py       # Per-memory trust scores
│   │   ├── quarantine_entry.py  # Quarantined memories
│   │   ├── audit_log.py         # Immutable audit trail
│   │   ├── connector_config.py  # Per-tenant connector settings
│   │   └── tenant.py            # Multi-tenant support
│   │
│   ├── connectors/              # Memory system adapters
│   │   ├── __init__.py
│   │   ├── base.py              # Abstract connector interface
│   │   ├── mem0.py              # Mem0 REST API adapter
│   │   ├── letta.py             # Letta adapter
│   │   ├── zep.py               # Zep adapter
│   │   ├── pgvector.py          # Direct pgvector adapter
│   │   ├── pinecone.py          # Pinecone adapter
│   │   └── generic_rest.py      # Webhook-based generic adapter
│   │
│   ├── engine/                  # Core validation logic
│   │   ├── __init__.py
│   │   ├── validator.py         # Main validation orchestrator
│   │   ├── strategies/
│   │   │   ├── __init__.py
│   │   │   ├── source_linked.py     # Re-fetch from original source
│   │   │   ├── cross_reference.py   # Multi-source verification
│   │   │   ├── semantic_drift.py    # Embedding-based drift detection
│   │   │   ├── temporal_pattern.py  # Statistical staleness prediction
│   │   │   └── causal_chain.py      # Dependency graph validation
│   │   ├── trust_calculator.py  # Trust score computation
│   │   ├── fact_classifier.py   # Classify memory by fact-type (job_title, price, address, etc.)
│   │   └── prompts.py           # LLM prompts for semantic validation
│   │
│   ├── quarantine/              # Memory quarantine management
│   │   ├── __init__.py
│   │   ├── manager.py           # Quarantine/restore/auto-remediate logic
│   │   └── remediation.py       # Auto-update stale memories from fresh sources
│   │
│   ├── scheduler/               # Validation job scheduling
│   │   ├── __init__.py
│   │   ├── scheduler.py         # Celery beat schedule management
│   │   ├── prioritizer.py       # Which memories to validate first
│   │   └── tasks.py             # Celery task definitions
│   │
│   ├── api/                     # API routes
│   │   ├── __init__.py
│   │   ├── router.py            # Main router
│   │   ├── routes/
│   │   │   ├── health.py        # Health check endpoints
│   │   │   ├── connectors.py    # CRUD for connector configs
│   │   │   ├── validation.py    # Trigger/status/history for validation jobs
│   │   │   ├── memories.py      # View tracked memories, trust scores
│   │   │   ├── quarantine.py    # Quarantine management endpoints
│   │   │   ├── audit.py         # Audit trail queries
│   │   │   ├── analytics.py     # Aggregated health metrics
│   │   │   └── webhooks.py      # Webhook configuration
│   │   ├── deps.py              # Dependency injection (db sessions, auth)
│   │   └── schemas.py           # Pydantic request/response schemas
│   │
│   ├── mcp/                     # MCP Server for agent integration
│   │   ├── __init__.py
│   │   └── server.py            # MCP tool definitions
│   │
│   └── utils/
│       ├── __init__.py
│       ├── crypto.py            # Signing/hashing for audit trail integrity
│       └── rate_limiter.py      # Per-source rate limiting
│
├── dashboard/                   # React frontend
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/
│       │   └── client.ts        # API client (fetch wrapper)
│       ├── components/
│       │   ├── Layout.tsx
│       │   ├── Sidebar.tsx
│       │   ├── HealthScore.tsx       # Overall memory health gauge
│       │   ├── MemoryTable.tsx       # Sortable/filterable memory list
│       │   ├── ValidationHistory.tsx # Timeline of validation runs
│       │   ├── TrustScoreBadge.tsx   # Visual trust score indicator
│       │   ├── QuarantinePanel.tsx   # Quarantined memories management
│       │   ├── StalenessHeatmap.tsx  # Category-based staleness visualization
│       │   ├── ConnectorStatus.tsx   # Connected memory systems status
│       │   └── AuditTrail.tsx        # Searchable audit log viewer
│       └── pages/
│           ├── Dashboard.tsx         # Main overview page
│           ├── Memories.tsx          # Memory explorer with trust scores
│           ├── Validations.tsx       # Validation job management
│           ├── Quarantine.tsx        # Quarantine management
│           ├── Connectors.tsx        # Connector configuration
│           ├── Analytics.tsx         # Staleness analytics & heatmaps
│           ├── AuditLog.tsx          # Audit trail page
│           └── Settings.tsx          # Platform settings
│
└── tests/
    ├── conftest.py              # Fixtures: test DB, mock connectors, mock LLM
    ├── unit/
    │   ├── test_trust_calculator.py
    │   ├── test_fact_classifier.py
    │   ├── test_source_linked.py
    │   ├── test_semantic_drift.py
    │   ├── test_temporal_pattern.py
    │   ├── test_quarantine_manager.py
    │   └── test_prioritizer.py
    ├── integration/
    │   ├── test_mem0_connector.py
    │   ├── test_validation_pipeline.py
    │   ├── test_api_routes.py
    │   └── test_mcp_server.py
    └── fixtures/
        ├── sample_memories.json
        └── mock_sources.json
```

---

## Database Schema

### `tenants`
```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    api_key_hash VARCHAR(255) NOT NULL UNIQUE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `connector_configs`
```sql
CREATE TABLE connector_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    connector_type VARCHAR(50) NOT NULL,  -- 'mem0', 'letta', 'zep', 'pgvector', 'pinecone', 'generic_rest'
    name VARCHAR(255) NOT NULL,
    config JSONB NOT NULL,  -- connection details (encrypted at rest)
    is_active BOOLEAN DEFAULT TRUE,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `memory_records`
```sql
CREATE TABLE memory_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    connector_id UUID REFERENCES connector_configs(id) ON DELETE CASCADE,
    external_id VARCHAR(500) NOT NULL,           -- ID in the source memory system
    content TEXT NOT NULL,                        -- The memory content/fact
    fact_type VARCHAR(100),                       -- 'job_title', 'price', 'address', 'preference', 'decision', etc.
    source_metadata JSONB DEFAULT '{}',           -- Where this memory came from
    -- source_metadata example:
    -- {
    --   "source_type": "api",          -- 'api', 'url', 'database', 'conversation', 'document'
    --   "source_url": "https://api.example.com/employees/123",
    --   "source_field": "title",
    --   "extraction_method": "llm_extract",
    --   "original_value": "Senior Engineer"
    -- }
    retrieval_count INTEGER DEFAULT 0,            -- How often this memory is retrieved by agents
    last_retrieved_at TIMESTAMPTZ,
    trust_score FLOAT DEFAULT 1.0,                -- Current trust score (0.0 - 1.0)
    status VARCHAR(20) DEFAULT 'active',          -- 'active', 'flagged', 'quarantined', 'invalidated'
    last_validated_at TIMESTAMPTZ,
    validation_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, connector_id, external_id)
);

CREATE INDEX idx_memory_records_trust ON memory_records(tenant_id, trust_score);
CREATE INDEX idx_memory_records_status ON memory_records(tenant_id, status);
CREATE INDEX idx_memory_records_fact_type ON memory_records(tenant_id, fact_type);
CREATE INDEX idx_memory_records_last_validated ON memory_records(tenant_id, last_validated_at);
```

### `validation_jobs`
```sql
CREATE TABLE validation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    connector_id UUID REFERENCES connector_configs(id),
    job_type VARCHAR(50) NOT NULL,       -- 'source_linked', 'cross_reference', 'semantic_drift', 'temporal_pattern', 'full_sweep'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'cancelled'
    priority INTEGER DEFAULT 5,           -- 1 (highest) to 10 (lowest)
    config JSONB DEFAULT '{}',            -- Job-specific parameters
    progress FLOAT DEFAULT 0.0,           -- 0.0 to 1.0
    total_memories INTEGER DEFAULT 0,
    validated_count INTEGER DEFAULT 0,
    flagged_count INTEGER DEFAULT 0,
    quarantined_count INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `validation_results`
```sql
CREATE TABLE validation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES validation_jobs(id) ON DELETE CASCADE,
    memory_id UUID REFERENCES memory_records(id) ON DELETE CASCADE,
    strategy VARCHAR(50) NOT NULL,        -- Which validation strategy was used
    previous_trust_score FLOAT,
    new_trust_score FLOAT,
    outcome VARCHAR(20) NOT NULL,         -- 'verified', 'flagged', 'quarantined', 'updated', 'error'
    evidence JSONB DEFAULT '{}',          -- What the validation found
    -- evidence example:
    -- {
    --   "source_current_value": "VP Engineering",
    --   "memory_stored_value": "Senior Engineer",
    --   "source_fetched_at": "2026-04-06T10:30:00Z",
    --   "drift_detected": true,
    --   "confidence": 0.92,
    --   "reasoning": "Source API now returns different job title"
    -- }
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_validation_results_memory ON validation_results(memory_id);
CREATE INDEX idx_validation_results_outcome ON validation_results(outcome);
```

### `quarantine_entries`
```sql
CREATE TABLE quarantine_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID REFERENCES memory_records(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    reason VARCHAR(50) NOT NULL,          -- 'stale', 'contradicted', 'source_unavailable', 'manual'
    original_content TEXT NOT NULL,
    original_trust_score FLOAT NOT NULL,
    validation_result_id UUID REFERENCES validation_results(id),
    remediation_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'auto_updated', 'human_approved', 'restored', 'deleted'
    remediated_content TEXT,              -- New value if auto-remediated
    remediated_by VARCHAR(50),            -- 'auto', 'human:user_id'
    remediated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `audit_logs`
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,      -- 'memory_validated', 'memory_quarantined', 'memory_restored', 'trust_score_changed', 'connector_synced'
    memory_id UUID,
    actor VARCHAR(100),                   -- 'system', 'scheduler', 'api:user_id', 'mcp:agent_id'
    details JSONB DEFAULT '{}',
    checksum VARCHAR(64) NOT NULL,        -- SHA-256 hash of (previous_checksum + event_data) for tamper detection
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant_time ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_memory ON audit_logs(memory_id);
```

### `staleness_patterns`
```sql
CREATE TABLE staleness_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    fact_type VARCHAR(100) NOT NULL,
    avg_staleness_days FLOAT,             -- Average days before this fact-type goes stale
    staleness_rate FLOAT,                 -- Percentage of validations that find staleness
    sample_size INTEGER DEFAULT 0,
    last_computed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, fact_type)
);
```

---

## Connector Interface (Abstract Base)

```python
# src/connectors/base.py

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
from datetime import datetime


@dataclass
class MemoryItem:
    """Normalized memory representation from any source system."""
    external_id: str
    content: str
    metadata: dict                        # Raw metadata from source system
    source_type: Optional[str] = None     # 'api', 'url', 'database', 'conversation', 'document'
    source_url: Optional[str] = None      # Re-fetchable source URL/endpoint
    source_field: Optional[str] = None    # Specific field in source
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    retrieval_count: Optional[int] = None
    tags: list[str] = None
    user_id: Optional[str] = None
    agent_id: Optional[str] = None


@dataclass
class MemoryUpdate:
    """Update to write back to the source memory system."""
    external_id: str
    trust_score: Optional[float] = None
    status: Optional[str] = None          # 'active', 'flagged', 'quarantined'
    metadata_updates: Optional[dict] = None


class BaseConnector(ABC):
    """Abstract interface for memory system connectors."""

    @abstractmethod
    async def connect(self, config: dict) -> bool:
        """Test connection to the memory system. Return True if successful."""
        ...

    @abstractmethod
    async def fetch_memories(
        self,
        limit: int = 100,
        offset: int = 0,
        sort_by: str = "retrieval_count",  # or 'created_at', 'updated_at'
        sort_order: str = "desc",
        filters: Optional[dict] = None
    ) -> list[MemoryItem]:
        """Fetch memories from the source system."""
        ...

    @abstractmethod
    async def fetch_memory_by_id(self, external_id: str) -> Optional[MemoryItem]:
        """Fetch a single memory by its ID in the source system."""
        ...

    @abstractmethod
    async def write_back(self, updates: list[MemoryUpdate]) -> bool:
        """Write validation results back to the source system.
        This updates trust scores and status flags in the original memory store.
        Returns True if writeback is supported and successful."""
        ...

    @abstractmethod
    async def get_memory_count(self) -> int:
        """Return total number of memories in the connected system."""
        ...

    def supports_writeback(self) -> bool:
        """Whether this connector supports writing trust scores back."""
        return True

    def supports_source_metadata(self) -> bool:
        """Whether memories from this source include fetchable source URLs."""
        return False
```

---

## Validation Strategies — Detailed Specs

### Strategy 1: Source-Linked Validation (`source_linked.py`)

**Input:** A memory that has `source_url` and optionally `source_field` in its metadata.

**Process:**
1. Fetch the source URL (with rate limiting and retry logic)
2. Extract the relevant field/content from the response
3. Compare current source value against stored memory content
4. If values match → verified, trust score increases
5. If values differ → flag, generate evidence, optionally auto-remediate

**Edge cases to handle:**
- Source URL returns 404 (source deleted) → flag as `source_unavailable`
- Source URL returns 403 (permissions changed) → flag, don't change trust score
- Source URL rate limited → retry with backoff, don't penalize the memory
- Source returns same data but different format → use fuzzy matching (Levenshtein + semantic similarity)
- Source URL is an API that requires auth → store auth config in connector_config

**Rate limiting:** Max 10 requests/second per source domain. Track per-domain rate limits in Redis.

### Strategy 2: Cross-Reference Validation (`cross_reference.py`)

**Input:** A memory of a verifiable fact-type (person's role, company info, pricing, etc.)

**Process:**
1. Classify the fact-type using `fact_classifier.py`
2. Based on fact-type, select appropriate cross-reference sources:
   - `job_title` → LinkedIn API, company website, news
   - `company_info` → Crunchbase, company website, SEC filings
   - `pricing` → Product page, pricing API, cached comparisons
   - `address` → Google Maps API, company website
3. Query 2-3 independent sources
4. Compare responses using semantic similarity
5. If majority agree with stored memory → verified
6. If majority contradict → flag with evidence from each source

**Important:** This strategy uses web_search/web_fetch or APIs. Budget LLM and API calls carefully. Only run on high-value memories (high retrieval count, critical fact-types).

### Strategy 3: Semantic Drift Detection (`semantic_drift.py`)

**Input:** A memory with no fetchable source, but the agent has had recent interactions.

**Process:**
1. Embed the stored memory using the same embedding model as the source system
2. Fetch recent agent interactions/conversations from the connector (last N sessions)
3. Look for semantic contradictions: recent context that implies the stored fact is no longer true
4. Use an LLM call with this prompt structure:

```
You are a memory validation system. Determine whether a stored memory
is likely still accurate given recent context.

STORED MEMORY (recorded {days_ago} days ago):
{memory_content}

RECENT AGENT CONTEXT (last {n_sessions} sessions):
{recent_context_summary}

Assess:
1. Does any recent context directly contradict this memory? (yes/no)
2. Does recent context suggest circumstances have changed enough that
   this memory may be outdated? (yes/no)
3. Confidence that this memory is STILL ACCURATE (0.0 to 1.0)
4. Brief reasoning (1-2 sentences)

Respond in JSON:
{"contradicted": bool, "likely_stale": bool, "confidence": float, "reasoning": str}
```

5. If confidence < 0.5 → flag for review
6. If contradicted = true → quarantine

**Cost control:** This strategy uses LLM inference. Max 100 memories per validation run. Prioritize memories with highest retrieval count that haven't been validated in 7+ days.

### Strategy 4: Temporal Pattern Prediction (`temporal_pattern.py`)

**Input:** Historical validation results for this tenant.

**Process:**
1. Query `validation_results` for all results where `outcome = 'flagged'` or `outcome = 'quarantined'`
2. Group by `fact_type`
3. Calculate: average days between memory creation and first staleness detection
4. Store in `staleness_patterns` table
5. For each active memory, predict staleness probability based on its fact-type and age:
   ```
   staleness_probability = 1 - exp(-age_days / avg_staleness_days)
   ```
6. If probability > 0.7 and memory hasn't been validated recently → prioritize for validation
7. If probability > 0.9 → auto-flag for review

**Minimum data:** Requires at least 20 validation results per fact-type before predictions are meaningful. Until then, fall back to default staleness curves:
- `job_title`: 365 days
- `pricing`: 90 days
- `address`: 730 days
- `preference`: 180 days
- `company_info`: 180 days
- `technical_fact`: 365 days
- `policy`: 90 days
- `relationship`: 180 days

### Strategy 5: Causal Chain Validation (`causal_chain.py`)

**Input:** Memory dependency graph (built incrementally).

**Process:**
1. When a memory is flagged/quarantined, check if other memories reference it
2. Build dependency graph using LLM-based relationship extraction:

```
Given these two memories, determine if Memory B depends on Memory A
being true. A "depends" relationship means that if Memory A becomes
false, Memory B would also likely be incorrect or invalid.

Memory A: {memory_a_content}
Memory B: {memory_b_content}

Respond in JSON:
{"depends": bool, "relationship": str, "strength": float}
```

3. When Memory A is invalidated, cascade flag to all dependent memories
4. Store dependency edges in a separate `memory_dependencies` table

**Build incrementally:** Don't try to build the full graph at once. When a memory is validated, check its 10 nearest neighbors (by embedding similarity) for potential dependencies. Add edges over time.

---

## Trust Score Calculation

```python
# src/engine/trust_calculator.py

def calculate_trust_score(
    source_reliability: float,       # 0-1: how reliable is the original source
    time_since_verified: float,      # hours since last successful validation
    fact_type_volatility: float,     # 0-1: how fast this fact-type typically changes
    cross_ref_agreement: float,      # 0-1: agreement ratio across multiple sources
    dependency_health: float,        # 0-1: avg trust of upstream dependencies
    historical_accuracy: float,      # 0-1: what % of past validations for this source were accurate
    retrieval_frequency: float,      # normalized: how often this memory is accessed
) -> float:
    """
    Calculate composite trust score.

    Weights are tunable per tenant. Defaults below.
    """
    weights = {
        "source_reliability": 0.20,
        "freshness": 0.25,           # Derived from time_since_verified + fact_type_volatility
        "cross_ref": 0.20,
        "dependency": 0.10,
        "historical": 0.15,
        "retrieval_importance": 0.10,
    }

    # Freshness decays exponentially based on fact-type volatility
    # High volatility + long time since verified = low freshness
    half_life_hours = (1 - fact_type_volatility) * 720 + 24  # 24h to 744h (1 month)
    freshness = math.exp(-0.693 * time_since_verified / half_life_hours)

    # Retrieval importance: memories accessed more often need more trust
    # This creates urgency — a stale memory retrieved 100x/day is more dangerous
    # than a stale memory retrieved once/month
    retrieval_weight = min(1.0, retrieval_frequency)

    score = (
        weights["source_reliability"] * source_reliability +
        weights["freshness"] * freshness +
        weights["cross_ref"] * cross_ref_agreement +
        weights["dependency"] * dependency_health +
        weights["historical"] * historical_accuracy +
        weights["retrieval_importance"] * retrieval_weight
    )

    return round(max(0.0, min(1.0, score)), 4)
```

---

## Fact Classifier

```python
# src/engine/fact_classifier.py

FACT_TYPE_PATTERNS = {
    "job_title": ["works as", "role is", "position", "title", "employed as", "CEO", "CTO", "engineer", "manager", "director"],
    "pricing": ["costs", "price", "fee", "rate", "$", "€", "subscription", "plan", "tier"],
    "address": ["located at", "address", "headquartered", "office at", "lives at"],
    "company_info": ["company", "founded", "employees", "revenue", "acquired", "merged"],
    "preference": ["prefers", "likes", "favorite", "usually", "tends to", "style"],
    "technical_fact": ["version", "API", "endpoint", "stack", "framework", "library", "database", "protocol"],
    "policy": ["policy", "rule", "compliance", "regulation", "requirement", "must", "shall not"],
    "relationship": ["reports to", "works with", "partner", "client", "vendor", "supplier"],
    "temporal": ["deadline", "due date", "scheduled", "planned for", "expires", "renewal"],
    "quantitative": ["count", "total", "percentage", "ratio", "metric", "KPI", "headcount"],
}

# Use LLM as fallback when pattern matching is ambiguous:
CLASSIFICATION_PROMPT = """
Classify this memory into exactly one fact-type category.

Memory: {content}

Categories:
- job_title: A person's role, position, or employment status
- pricing: Cost, fee, subscription, or pricing information
- address: Physical location or address
- company_info: Company details (founding, size, structure, status)
- preference: User or entity preferences, habits, tendencies
- technical_fact: Software versions, API details, technical specifications
- policy: Rules, regulations, compliance requirements
- relationship: Relationships between people, companies, or entities
- temporal: Deadlines, schedules, expiration dates
- quantitative: Numbers, metrics, counts, percentages
- other: Doesn't fit above categories

Respond with JSON: {"fact_type": str, "confidence": float, "reasoning": str}
"""
```

---

## MCP Server Specification

The MCP server exposes MemGuard as tools that any AI agent can call natively.

```python
# src/mcp/server.py — Tool definitions

TOOLS = [
    {
        "name": "validate_memory",
        "description": "Check if a specific memory is still accurate before acting on it. Returns trust score and validation status. Call this before making decisions based on stored facts that might be outdated.",
        "parameters": {
            "memory_id": "The ID of the memory to validate",
            "strategy": "Optional: 'source_linked', 'semantic', 'quick'. Default: 'quick' (checks trust score and recent validation status without running a new validation)"
        },
        "returns": {
            "trust_score": "float 0-1",
            "status": "'verified' | 'flagged' | 'quarantined' | 'unknown'",
            "last_validated_at": "ISO timestamp",
            "evidence": "Brief explanation if flagged"
        }
    },
    {
        "name": "get_memory_health",
        "description": "Get overall health metrics for the agent's memory store. Use this to assess how reliable the current memory state is.",
        "parameters": {
            "connector_id": "Optional: specific memory system to check"
        },
        "returns": {
            "total_memories": "int",
            "verified_pct": "float",
            "flagged_count": "int",
            "quarantined_count": "int",
            "avg_trust_score": "float",
            "oldest_unvalidated_days": "int"
        }
    },
    {
        "name": "report_stale_memory",
        "description": "Report a memory that the agent suspects is stale based on new information encountered during a task. This triggers priority validation.",
        "parameters": {
            "memory_id": "The ID of the suspected stale memory",
            "reason": "Why the agent suspects staleness",
            "contradicting_evidence": "Optional: new information that contradicts the memory"
        },
        "returns": {
            "acknowledged": "bool",
            "validation_job_id": "UUID of triggered validation"
        }
    },
    {
        "name": "get_trusted_memories",
        "description": "Retrieve only memories above a trust score threshold. Use instead of raw memory retrieval when accuracy is critical.",
        "parameters": {
            "query": "Semantic search query",
            "min_trust_score": "Minimum trust score (default: 0.7)",
            "limit": "Max results (default: 10)"
        },
        "returns": {
            "memories": "List of memories with trust scores and validation timestamps"
        }
    }
]
```

---

## API Endpoints

### Health
- `GET /health` — Service health check
- `GET /health/connectors` — All connector statuses

### Connectors
- `POST /api/v1/connectors` — Register a new memory system connection
- `GET /api/v1/connectors` — List all connectors for tenant
- `GET /api/v1/connectors/{id}` — Get connector details
- `PUT /api/v1/connectors/{id}` — Update connector config
- `DELETE /api/v1/connectors/{id}` — Remove connector
- `POST /api/v1/connectors/{id}/test` — Test connector connectivity
- `POST /api/v1/connectors/{id}/sync` — Trigger full memory sync from source

### Memories
- `GET /api/v1/memories` — List tracked memories (paginated, filterable by status, fact_type, trust_score range)
- `GET /api/v1/memories/{id}` — Get memory details with full validation history
- `GET /api/v1/memories/{id}/trust-history` — Trust score over time for a single memory
- `GET /api/v1/memories/stats` — Aggregate stats (counts by status, avg trust, fact-type distribution)

### Validation
- `POST /api/v1/validations` — Trigger a validation job (specify strategy, scope, priority)
- `GET /api/v1/validations` — List validation jobs (paginated, filterable by status)
- `GET /api/v1/validations/{id}` — Get job details with results
- `POST /api/v1/validations/{id}/cancel` — Cancel a running job
- `POST /api/v1/validate-single/{memory_id}` — Validate a single memory immediately (synchronous)

### Quarantine
- `GET /api/v1/quarantine` — List quarantined memories
- `POST /api/v1/quarantine/{id}/restore` — Restore a quarantined memory to active
- `POST /api/v1/quarantine/{id}/approve-remediation` — Approve auto-remediated content
- `DELETE /api/v1/quarantine/{id}` — Permanently delete quarantined memory

### Analytics
- `GET /api/v1/analytics/health-score` — Overall memory health score
- `GET /api/v1/analytics/staleness-heatmap` — Staleness rates by fact-type
- `GET /api/v1/analytics/validation-trends` — Validation outcomes over time
- `GET /api/v1/analytics/high-risk` — Memories with lowest trust that are most frequently retrieved

### Audit
- `GET /api/v1/audit` — Audit log (paginated, filterable by event_type, memory_id, date range)
- `GET /api/v1/audit/export` — Export audit trail as JSON (for compliance)
- `GET /api/v1/audit/verify-integrity` — Verify audit log chain integrity (checksum validation)

### Webhooks
- `POST /api/v1/webhooks` — Register webhook endpoint
- `GET /api/v1/webhooks` — List registered webhooks
- `DELETE /api/v1/webhooks/{id}` — Remove webhook

Webhook events emitted:
- `memory.flagged` — A memory's trust score dropped below threshold
- `memory.quarantined` — A memory was quarantined
- `memory.validated` — A memory was successfully verified
- `validation.completed` — A validation job finished
- `health.degraded` — Overall memory health score dropped below threshold

---

## Scheduler & Prioritization Logic

### Default Validation Schedule (Celery Beat)

```python
CELERYBEAT_SCHEDULE = {
    # Full sweep: validate all memories that haven't been checked in 7 days
    "full-sweep-weekly": {
        "task": "memguard.tasks.run_validation_sweep",
        "schedule": crontab(hour=2, minute=0, day_of_week="sunday"),  # Sunday 2 AM
        "kwargs": {"strategy": "source_linked", "max_age_days": 7}
    },
    # High-priority check: validate top-retrieved memories daily
    "high-priority-daily": {
        "task": "memguard.tasks.run_priority_validation",
        "schedule": crontab(hour=3, minute=0),  # Daily 3 AM
        "kwargs": {"top_n": 50, "strategy": "source_linked"}
    },
    # Temporal pattern update: recalculate staleness patterns
    "pattern-update-weekly": {
        "task": "memguard.tasks.update_staleness_patterns",
        "schedule": crontab(hour=4, minute=0, day_of_week="monday"),
    },
    # Connector sync: pull new/updated memories from connected systems
    "connector-sync-hourly": {
        "task": "memguard.tasks.sync_all_connectors",
        "schedule": crontab(minute=0),  # Every hour
    },
}
```

### Prioritization Algorithm

```python
# src/scheduler/prioritizer.py

def calculate_validation_priority(memory) -> float:
    """
    Higher score = validate sooner.
    
    Factors:
    1. Retrieval frequency (high retrieval = more dangerous if stale)
    2. Time since last validation (longer = more urgent)
    3. Fact-type volatility (prices change faster than addresses)
    4. Current trust score (lower trust = check sooner)
    5. Whether it has a fetchable source (cheaper to validate)
    """
    retrieval_score = min(1.0, memory.retrieval_count / 100)
    
    hours_since_validated = (now() - memory.last_validated_at).total_seconds() / 3600
    freshness_score = min(1.0, hours_since_validated / 168)  # Normalize to 1 week
    
    volatility = get_fact_type_volatility(memory.fact_type)
    
    trust_urgency = 1.0 - memory.trust_score  # Lower trust = higher urgency
    
    source_bonus = 0.2 if memory.source_metadata.get("source_url") else 0.0
    
    priority = (
        0.30 * retrieval_score +
        0.25 * freshness_score +
        0.20 * volatility +
        0.15 * trust_urgency +
        0.10 * source_bonus
    )
    
    return round(priority, 4)
```

---

## Audit Trail Integrity

Every audit log entry contains a chained checksum for tamper detection:

```python
# src/utils/crypto.py

import hashlib
import json

def compute_audit_checksum(previous_checksum: str, event_data: dict) -> str:
    """
    Blockchain-style chaining: each entry's checksum depends on the previous one.
    If any entry is modified or deleted, the chain breaks.
    """
    payload = json.dumps({
        "previous": previous_checksum,
        "event": event_data
    }, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def verify_audit_chain(audit_entries: list) -> tuple[bool, Optional[int]]:
    """
    Verify the entire audit chain. Returns (is_valid, first_broken_index).
    """
    for i, entry in enumerate(audit_entries):
        if i == 0:
            expected_prev = "GENESIS"
        else:
            expected_prev = audit_entries[i - 1].checksum
        
        expected = compute_audit_checksum(expected_prev, entry.details)
        if entry.checksum != expected:
            return False, i
    
    return True, None
```

---

## Environment Variables

```env
# .env

# Core
MEMGUARD_ENV=development                    # development, staging, production
MEMGUARD_SECRET_KEY=change-me-in-production
MEMGUARD_API_PORT=8000

# Database
DATABASE_URL=postgresql+asyncpg://memguard:memguard@localhost:5432/memguard

# Redis
REDIS_URL=redis://localhost:6379/0

# LLM (for semantic validation)
ANTHROPIC_API_KEY=sk-ant-...
MEMGUARD_LLM_MODEL=claude-sonnet-4-20250514
MEMGUARD_LLM_MAX_TOKENS=1024
MEMGUARD_LLM_RATE_LIMIT_RPM=60             # Max LLM calls per minute

# Validation defaults
MEMGUARD_DEFAULT_TRUST_THRESHOLD=0.5        # Below this = auto-flag
MEMGUARD_QUARANTINE_THRESHOLD=0.3           # Below this = auto-quarantine
MEMGUARD_MAX_VALIDATION_BATCH=100           # Max memories per validation job
MEMGUARD_SOURCE_FETCH_TIMEOUT=10            # Seconds
MEMGUARD_SOURCE_RATE_LIMIT_PER_DOMAIN=10    # Requests per second per domain

# Dashboard
VITE_API_URL=http://localhost:8000
```

---

## Docker Compose

```yaml
# docker-compose.yml

version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: memguard
      POSTGRES_PASSWORD: memguard
      POSTGRES_DB: memguard
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api:
    build: .
    command: uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      - postgres
      - redis
    volumes:
      - .:/app

  worker:
    build: .
    command: celery -A src.scheduler.tasks worker --loglevel=info
    env_file: .env
    depends_on:
      - postgres
      - redis
    volumes:
      - .:/app

  beat:
    build: .
    command: celery -A src.scheduler.tasks beat --loglevel=info
    env_file: .env
    depends_on:
      - postgres
      - redis
    volumes:
      - .:/app

  dashboard:
    build:
      context: ./dashboard
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://localhost:8000
    depends_on:
      - api

volumes:
  pgdata:
```

---

## Development Phases & Build Order

### Phase 1 — Foundation (Week 1-2)
Build in this exact order:
1. `pyproject.toml` with all dependencies
2. `docker-compose.yml` — get Postgres + Redis running
3. `src/config.py` — env var loading
4. `src/models/` — all SQLAlchemy models
5. `alembic/` — initial migration
6. `src/main.py` — FastAPI app shell with CORS
7. `src/api/routes/health.py` — health check endpoint
8. **Verify:** `docker-compose up` works, API responds on :8000, DB migrations run

### Phase 2 — Connector Layer (Week 2-3)
1. `src/connectors/base.py` — abstract interface
2. `src/connectors/mem0.py` — first connector (Mem0 REST API)
3. `src/api/routes/connectors.py` — CRUD endpoints
4. `src/connectors/generic_rest.py` — webhook-based generic connector
5. `tests/unit/test_mem0_connector.py` — with mocked HTTP responses
6. **Verify:** Can register a connector, test connectivity, fetch memories

### Phase 3 — Validation Engine (Week 3-4)
1. `src/engine/fact_classifier.py` — pattern + LLM classification
2. `src/engine/strategies/source_linked.py` — source re-fetch validation
3. `src/engine/trust_calculator.py` — trust score computation
4. `src/engine/validator.py` — orchestrator that runs strategies
5. `src/api/routes/validation.py` — trigger and monitor jobs
6. `src/api/routes/memories.py` — view memories with trust scores
7. `tests/unit/test_trust_calculator.py`
8. `tests/unit/test_source_linked.py`
9. **Verify:** Can trigger validation, see results, trust scores update

### Phase 4 — Quarantine & Audit (Week 4-5)
1. `src/quarantine/manager.py` — quarantine/restore logic
2. `src/quarantine/remediation.py` — auto-update from fresh sources
3. `src/utils/crypto.py` — audit trail checksums
4. `src/api/routes/quarantine.py`
5. `src/api/routes/audit.py`
6. **Verify:** Memories get quarantined when trust drops, audit chain is valid

### Phase 5 — Scheduler (Week 5-6)
1. `src/scheduler/tasks.py` — Celery task definitions
2. `src/scheduler/prioritizer.py` — priority scoring
3. `src/scheduler/scheduler.py` — beat schedule
4. **Verify:** Validation runs automatically on schedule, high-priority memories checked first

### Phase 6 — Dashboard (Week 6-8)
1. Dashboard scaffolding (Vite + React + Tailwind + React Router)
2. `api/client.ts` — API wrapper
3. `Dashboard.tsx` — health score, recent validations, alerts
4. `Memories.tsx` — memory table with trust scores, filtering, sorting
5. `Validations.tsx` — job list and details
6. `Quarantine.tsx` — quarantine management
7. `Analytics.tsx` — staleness heatmap, trend charts (use Recharts)
8. `AuditLog.tsx` — searchable audit trail
9. `Connectors.tsx` — connector management
10. `Settings.tsx` — threshold configuration

### Phase 7 — Advanced Strategies (Week 8-10)
1. `src/engine/strategies/semantic_drift.py`
2. `src/engine/strategies/temporal_pattern.py`
3. `src/engine/strategies/cross_reference.py`
4. `src/engine/strategies/causal_chain.py`

### Phase 8 — MCP Server (Week 10-11)
1. `src/mcp/server.py` — all 4 MCP tools
2. `tests/integration/test_mcp_server.py`

### Phase 9 — Production Hardening (Week 11-12)
1. API key authentication middleware
2. Rate limiting on all endpoints
3. Multi-tenant isolation (tenant_id filtering on every query)
4. Webhook emitter for events
5. Error handling, logging, monitoring setup
6. Dockerfile optimization (multi-stage build)

---

## Coding Conventions

- **Async everywhere:** All database operations and HTTP calls use async/await
- **Type hints:** Every function has full type annotations
- **Pydantic for validation:** All API inputs/outputs use Pydantic schemas
- **No raw SQL:** Use SQLAlchemy ORM for all queries
- **Dependency injection:** Use FastAPI's `Depends()` for DB sessions, auth, connectors
- **Error handling:** Custom exception classes, global exception handler in FastAPI
- **Logging:** Structured JSON logging via `structlog`
- **Tests:** Every new module gets a corresponding test file. Mock external calls.
- **Naming:** snake_case for Python, camelCase for TypeScript/React
- **Imports:** stdlib → third-party → local, separated by blank lines
- **Max line length:** 120 characters
- **Docstrings:** Google style on all public functions

---

## Key Dependencies

### Python (`pyproject.toml`)
```
fastapi>=0.115
uvicorn[standard]>=0.34
sqlalchemy[asyncio]>=2.0
asyncpg>=0.30
alembic>=1.14
celery[redis]>=5.4
redis>=5.2
pydantic>=2.10
pydantic-settings>=2.7
httpx>=0.28               # Async HTTP client for source fetching
anthropic>=0.43            # LLM calls for semantic validation
structlog>=24.4
python-jose>=3.3           # JWT for API auth
passlib[bcrypt]>=1.7       # API key hashing
mcp>=1.0                   # MCP SDK for agent integration
pytest>=8.3
pytest-asyncio>=0.24
pytest-httpx>=0.35         # Mock HTTP calls in tests
factory-boy>=3.3           # Test fixtures
```

### Dashboard (`package.json`)
```
react: ^18
react-dom: ^18
react-router-dom: ^6
@tanstack/react-query: ^5  # Data fetching & caching
recharts: ^2               # Charts for analytics
tailwindcss: ^3
lucide-react: latest        # Icons
date-fns: ^4               # Date formatting
```

---

## Non-Obvious Implementation Notes

1. **Mem0 API:** Their REST API is at `https://api.mem0.ai/v1/memories/`. Auth via `Authorization: Token <api_key>`. Memories have `id`, `memory` (content string), `metadata`, `created_at`, `updated_at`. Check their current docs before implementing — the API may have changed.

2. **Trust score writeback:** Not all memory systems support writing custom metadata back. Mem0 supports metadata updates. For systems that don't, store trust scores only in MemGuard's DB and expose them via the MCP server's `get_trusted_memories` tool.

3. **LLM cost control:** At $3/MTok input for Claude Sonnet, validating 1000 memories with semantic drift at ~500 tokens each = ~$1.50 per sweep. Budget a max of $50/month per tenant for LLM calls. Track usage in Redis and enforce limits.

4. **Audit log immutability:** Never UPDATE or DELETE audit log entries. The chained checksum makes tampering detectable. If an entry needs correction, append a new `correction` event type.

5. **Source URL fetching:** Always respect robots.txt. Set User-Agent to `MemGuard/1.0 (memory-validation-service)`. Cache source responses for 1 hour to avoid hammering the same URL across multiple memories.

6. **Multi-tenant from day one:** Even for MVP, every DB query must filter by `tenant_id`. Add this as middleware that extracts tenant from API key. Never query without tenant scope.

7. **Memory deduplication:** The same fact might exist in multiple memory systems. Use content hashing to detect duplicates across connectors. Validate once, apply result to all copies.