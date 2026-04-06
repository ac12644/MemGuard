import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base, TimestampMixin


class ValidationJob(Base, TimestampMixin):
    __tablename__ = "validation_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    connector_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_configs.id"), nullable=True
    )
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="'pending'")
    priority: Mapped[int] = mapped_column(Integer, default=5, server_default="5")
    config: Mapped[dict] = mapped_column(JSONB, server_default="{}", default=dict)
    progress: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")
    total_memories: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    validated_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    flagged_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    quarantined_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant = relationship("Tenant", back_populates="validation_jobs")
    connector = relationship("ConnectorConfig", back_populates="validation_jobs")
    validation_results = relationship("ValidationResult", back_populates="job", cascade="all, delete-orphan")
