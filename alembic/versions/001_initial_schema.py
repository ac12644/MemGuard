"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-04-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tenants
    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("api_key_hash", sa.String(255), nullable=False),
        sa.Column("settings", postgresql.JSONB(), server_default="{}", nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("api_key_hash"),
    )

    # Connector configs
    op.create_table(
        "connector_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("connector_type", sa.String(50), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("config", postgresql.JSONB(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=True),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )

    # Memory records
    op.create_table(
        "memory_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("connector_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("external_id", sa.String(500), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("fact_type", sa.String(100), nullable=True),
        sa.Column("source_metadata", postgresql.JSONB(), server_default="{}", nullable=True),
        sa.Column("retrieval_count", sa.Integer(), server_default="0", nullable=True),
        sa.Column("last_retrieved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trust_score", sa.Float(), server_default="1.0", nullable=True),
        sa.Column("status", sa.String(20), server_default="'active'", nullable=True),
        sa.Column("last_validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("validation_count", sa.Integer(), server_default="0", nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["connector_id"], ["connector_configs.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "connector_id", "external_id", name="uq_memory_tenant_connector_external"),
    )
    op.create_index("idx_memory_records_trust", "memory_records", ["tenant_id", "trust_score"])
    op.create_index("idx_memory_records_status", "memory_records", ["tenant_id", "status"])
    op.create_index("idx_memory_records_fact_type", "memory_records", ["tenant_id", "fact_type"])
    op.create_index("idx_memory_records_last_validated", "memory_records", ["tenant_id", "last_validated_at"])

    # Validation jobs
    op.create_table(
        "validation_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("connector_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("job_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), server_default="'pending'", nullable=True),
        sa.Column("priority", sa.Integer(), server_default="5", nullable=True),
        sa.Column("config", postgresql.JSONB(), server_default="{}", nullable=True),
        sa.Column("progress", sa.Float(), server_default="0.0", nullable=True),
        sa.Column("total_memories", sa.Integer(), server_default="0", nullable=True),
        sa.Column("validated_count", sa.Integer(), server_default="0", nullable=True),
        sa.Column("flagged_count", sa.Integer(), server_default="0", nullable=True),
        sa.Column("quarantined_count", sa.Integer(), server_default="0", nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["connector_id"], ["connector_configs.id"]),
    )

    # Validation results
    op.create_table(
        "validation_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("memory_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("strategy", sa.String(50), nullable=False),
        sa.Column("previous_trust_score", sa.Float(), nullable=True),
        sa.Column("new_trust_score", sa.Float(), nullable=True),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("evidence", postgresql.JSONB(), server_default="{}", nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["job_id"], ["validation_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["memory_id"], ["memory_records.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_validation_results_memory", "validation_results", ["memory_id"])
    op.create_index("idx_validation_results_outcome", "validation_results", ["outcome"])

    # Quarantine entries
    op.create_table(
        "quarantine_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("memory_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reason", sa.String(50), nullable=False),
        sa.Column("original_content", sa.Text(), nullable=False),
        sa.Column("original_trust_score", sa.Float(), nullable=False),
        sa.Column("validation_result_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("remediation_status", sa.String(20), server_default="'pending'", nullable=True),
        sa.Column("remediated_content", sa.Text(), nullable=True),
        sa.Column("remediated_by", sa.String(50), nullable=True),
        sa.Column("remediated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["memory_id"], ["memory_records.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["validation_result_id"], ["validation_results.id"]),
    )

    # Audit logs
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("memory_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor", sa.String(100), nullable=True),
        sa.Column("details", postgresql.JSONB(), server_default="{}", nullable=True),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_audit_logs_tenant_time", "audit_logs", ["tenant_id", "created_at"])
    op.create_index("idx_audit_logs_memory", "audit_logs", ["memory_id"])

    # Staleness patterns
    op.create_table(
        "staleness_patterns",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("fact_type", sa.String(100), nullable=False),
        sa.Column("avg_staleness_days", sa.Float(), nullable=True),
        sa.Column("staleness_rate", sa.Float(), nullable=True),
        sa.Column("sample_size", sa.Integer(), server_default="0", nullable=True),
        sa.Column("last_computed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "fact_type", name="uq_staleness_tenant_fact_type"),
    )


def downgrade() -> None:
    op.drop_table("staleness_patterns")
    op.drop_table("audit_logs")
    op.drop_table("quarantine_entries")
    op.drop_table("validation_results")
    op.drop_table("validation_jobs")
    op.drop_table("memory_records")
    op.drop_table("connector_configs")
    op.drop_table("tenants")
