import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base


class ValidationResult(Base):
    __tablename__ = "validation_results"
    __table_args__ = (
        Index("idx_validation_results_memory", "memory_id"),
        Index("idx_validation_results_outcome", "outcome"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("validation_jobs.id", ondelete="CASCADE"), nullable=False
    )
    memory_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("memory_records.id", ondelete="CASCADE"), nullable=False
    )
    strategy: Mapped[str] = mapped_column(String(50), nullable=False)
    previous_trust_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    new_trust_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)
    evidence: Mapped[dict] = mapped_column(JSONB, server_default="{}", default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    job = relationship("ValidationJob", back_populates="validation_results")
    memory = relationship("MemoryRecord", back_populates="validation_results")
