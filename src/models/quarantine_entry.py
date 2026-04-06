import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base


class QuarantineEntry(Base):
    __tablename__ = "quarantine_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    memory_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("memory_records.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    original_content: Mapped[str] = mapped_column(Text, nullable=False)
    original_trust_score: Mapped[float] = mapped_column(Float, nullable=False)
    validation_result_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("validation_results.id"), nullable=True
    )
    remediation_status: Mapped[str] = mapped_column(
        String(20), default="pending", server_default="'pending'"
    )
    remediated_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    remediated_by: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    remediated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    memory = relationship("MemoryRecord", back_populates="quarantine_entries")
    tenant = relationship("Tenant", back_populates="quarantine_entries")
    validation_result = relationship("ValidationResult")
