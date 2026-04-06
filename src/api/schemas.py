import uuid
from datetime import datetime

from pydantic import BaseModel, Field

# --- Connector schemas ---

class ConnectorConfigCreate(BaseModel):
    connector_type: str = Field(..., description="One of: mem0, generic_rest")
    name: str = Field(..., max_length=255)
    config: dict = Field(..., description="Connector-specific configuration")


class ConnectorConfigUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    config: dict | None = None
    is_active: bool | None = None


class ConnectorConfigResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    connector_type: str
    name: str
    config: dict
    is_active: bool
    last_sync_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConnectorTestResponse(BaseModel):
    connected: bool
    memory_count: int | None = None
    error: str | None = None


# --- Memory schemas ---

class MemoryRecordResponse(BaseModel):
    id: uuid.UUID
    connector_id: uuid.UUID
    external_id: str
    content: str
    fact_type: str | None = None
    source_metadata: dict
    retrieval_count: int
    trust_score: float
    status: str
    last_validated_at: datetime | None = None
    validation_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MemoryStatsResponse(BaseModel):
    total: int
    active: int
    flagged: int
    quarantined: int
    invalidated: int
    avg_trust_score: float
    fact_type_distribution: dict[str, int]


# --- Validation schemas ---

class ValidationJobCreate(BaseModel):
    connector_id: uuid.UUID | None = None
    job_type: str = Field(..., description="source_linked, cross_reference, semantic_drift, temporal_pattern")
    priority: int = Field(default=5, ge=1, le=10)
    config: dict = Field(default_factory=dict)


class ValidationJobResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    connector_id: uuid.UUID | None = None
    job_type: str
    status: str
    priority: int
    progress: float
    total_memories: int
    validated_count: int
    flagged_count: int
    quarantined_count: int
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ValidationResultResponse(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    memory_id: uuid.UUID
    strategy: str
    previous_trust_score: float | None = None
    new_trust_score: float | None = None
    outcome: str
    evidence: dict
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Quarantine schemas ---

class QuarantineEntryResponse(BaseModel):
    id: uuid.UUID
    memory_id: uuid.UUID
    reason: str
    original_content: str
    original_trust_score: float
    remediation_status: str
    remediated_content: str | None = None
    remediated_by: str | None = None
    remediated_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Audit schemas ---

class AuditLogResponse(BaseModel):
    id: uuid.UUID
    event_type: str
    memory_id: uuid.UUID | None = None
    actor: str | None = None
    details: dict
    checksum: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Analytics schemas ---

class HealthScoreResponse(BaseModel):
    overall_score: float
    total_memories: int
    verified_pct: float
    flagged_count: int
    quarantined_count: int
    avg_trust_score: float
    oldest_unvalidated_days: int | None = None


class StalenessHeatmapEntry(BaseModel):
    fact_type: str
    avg_staleness_days: float | None = None
    staleness_rate: float | None = None
    sample_size: int


# --- Common ---

class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
