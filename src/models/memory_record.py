import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import BaseModel


class MemoryRecord(BaseModel):
    __tablename__ = "memory_records"
    __table_args__ = (
        UniqueConstraint("tenant_id", "connector_id", "external_id", name="uq_memory_tenant_connector_external"),
        Index("idx_memory_records_trust", "tenant_id", "trust_score"),
        Index("idx_memory_records_status", "tenant_id", "status"),
        Index("idx_memory_records_fact_type", "tenant_id", "fact_type"),
        Index("idx_memory_records_last_validated", "tenant_id", "last_validated_at"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    connector_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_configs.id", ondelete="CASCADE"), nullable=False
    )
    external_id: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    fact_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_metadata: Mapped[dict] = mapped_column(JSONB, server_default="{}", default=dict)
    retrieval_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trust_score: Mapped[float] = mapped_column(Float, default=1.0, server_default="1.0")
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="'active'")
    last_validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    validation_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    tenant = relationship("Tenant", back_populates="memory_records")
    connector = relationship("ConnectorConfig", back_populates="memory_records")
    validation_results = relationship("ValidationResult", back_populates="memory", cascade="all, delete-orphan")
    quarantine_entries = relationship("QuarantineEntry", back_populates="memory", cascade="all, delete-orphan")
