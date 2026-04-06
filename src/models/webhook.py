import uuid

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import BaseModel


class Webhook(BaseModel):
    __tablename__ = "webhooks"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    events: Mapped[list] = mapped_column(JSONB, nullable=False)  # e.g. ["memory.flagged", "memory.quarantined"]
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    secret: Mapped[str] = mapped_column(String(255), nullable=True)  # For HMAC signing

    tenant = relationship("Tenant")
