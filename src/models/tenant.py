from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import BaseModel


class Tenant(BaseModel):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    api_key_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    settings: Mapped[dict] = mapped_column(JSONB, server_default="{}", default=dict)

    connector_configs = relationship("ConnectorConfig", back_populates="tenant", cascade="all, delete-orphan")
    memory_records = relationship("MemoryRecord", back_populates="tenant", cascade="all, delete-orphan")
    validation_jobs = relationship("ValidationJob", back_populates="tenant", cascade="all, delete-orphan")
    quarantine_entries = relationship("QuarantineEntry", back_populates="tenant", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="tenant", cascade="all, delete-orphan")
    staleness_patterns = relationship("StalenessPattern", back_populates="tenant", cascade="all, delete-orphan")
