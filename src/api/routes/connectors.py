import copy
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_tenant
from src.api.schemas import ConnectorConfigCreate, ConnectorConfigResponse, ConnectorConfigUpdate, ConnectorTestResponse
from src.connectors.registry import get_connector
from src.models.connector_config import ConnectorConfig
from src.models.tenant import Tenant
from src.utils.crypto import decrypt_value, encrypt_value, mask_secret

router = APIRouter(prefix="/api/v1/connectors", tags=["connectors"])

SECRET_FIELDS = {"api_key", "auth_value", "secret", "token", "password"}


def _encrypt_config(config: dict) -> dict:
    """Encrypt secret fields in connector config before storing."""
    encrypted = copy.deepcopy(config)
    for key in SECRET_FIELDS:
        if key in encrypted and encrypted[key] and not encrypted[key].startswith("enc:"):
            encrypted[key] = "enc:" + encrypt_value(encrypted[key])
    return encrypted


def _decrypt_config(config: dict) -> dict:
    """Decrypt secret fields in connector config for use."""
    decrypted = copy.deepcopy(config)
    for key in SECRET_FIELDS:
        if key in decrypted and isinstance(decrypted[key], str) and decrypted[key].startswith("enc:"):
            decrypted[key] = decrypt_value(decrypted[key][4:])
    return decrypted


def _mask_config(config: dict) -> dict:
    """Mask secret fields for API responses."""
    masked = copy.deepcopy(config)
    for key in SECRET_FIELDS:
        if key in masked and masked[key]:
            raw = masked[key]
            if isinstance(raw, str) and raw.startswith("enc:"):
                masked[key] = "••••••••"
            else:
                masked[key] = mask_secret(raw)
    return masked


@router.post("", response_model=ConnectorConfigResponse, status_code=201)
async def create_connector(
    body: ConnectorConfigCreate,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> ConnectorConfig:
    """Register a new memory system connection. Secrets are encrypted at rest."""
    connector = ConnectorConfig(
        tenant_id=tenant.id,
        connector_type=body.connector_type,
        name=body.name,
        config=_encrypt_config(body.config),
    )
    db.add(connector)
    await db.flush()
    await db.refresh(connector)
    db.expunge(connector)
    connector.config = _mask_config(connector.config)
    return connector


@router.get("", response_model=list[ConnectorConfigResponse])
async def list_connectors(
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[ConnectorConfig]:
    """List all connectors for the tenant. Secrets are masked in response."""
    result = await db.execute(
        select(ConnectorConfig).where(ConnectorConfig.tenant_id == tenant.id).order_by(ConnectorConfig.created_at)
    )
    connectors = list(result.scalars().all())
    # Expunge so masking doesn't write back to DB
    for c in connectors:
        db.expunge(c)
        c.config = _mask_config(c.config)
    return connectors


@router.get("/{connector_id}", response_model=ConnectorConfigResponse)
async def get_connector_detail(
    connector_id: uuid.UUID,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> ConnectorConfig:
    """Get connector details. Secrets are masked in response."""
    connector = await _get_connector_or_404(connector_id, tenant.id, db)
    db.expunge(connector)
    connector.config = _mask_config(connector.config)
    return connector


@router.put("/{connector_id}", response_model=ConnectorConfigResponse)
async def update_connector(
    connector_id: uuid.UUID,
    body: ConnectorConfigUpdate,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> ConnectorConfig:
    """Update connector configuration."""
    connector = await _get_connector_or_404(connector_id, tenant.id, db)
    if body.name is not None:
        connector.name = body.name
    if body.config is not None:
        connector.config = _encrypt_config(body.config)
    if body.is_active is not None:
        connector.is_active = body.is_active
    await db.flush()
    await db.refresh(connector)
    return connector


@router.delete("/{connector_id}", status_code=204)
async def delete_connector(
    connector_id: uuid.UUID,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a connector."""
    connector = await _get_connector_or_404(connector_id, tenant.id, db)
    await db.delete(connector)


@router.post("/{connector_id}/test", response_model=ConnectorTestResponse)
async def test_connector(
    connector_id: uuid.UUID,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Test connector connectivity."""
    connector_config = await _get_connector_or_404(connector_id, tenant.id, db)
    try:
        decrypted = _decrypt_config(connector_config.config)
        conn = get_connector(connector_config.connector_type, decrypted)
        connected = await conn.connect(decrypted)
        memory_count = await conn.get_memory_count() if connected else None
        return {"connected": connected, "memory_count": memory_count}
    except Exception as e:
        return {"connected": False, "error": str(e)}


@router.post("/{connector_id}/sync", status_code=202)
async def sync_connector(
    connector_id: uuid.UUID,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Sync memories from source into MemGuard. Runs inline for immediate results."""
    from datetime import datetime, timezone

    from src.engine.fact_classifier import classify_fact_type
    from src.models.memory_record import MemoryRecord

    connector_config = await _get_connector_or_404(connector_id, tenant.id, db)
    decrypted = _decrypt_config(connector_config.config)
    conn = get_connector(connector_config.connector_type, decrypted)

    try:
        memories = await conn.fetch_memories(limit=100)
    except Exception as e:
        return {"status": "error", "error": str(e), "synced": 0}

    synced = 0
    for mem in memories:
        existing = await db.execute(
            select(MemoryRecord).where(
                MemoryRecord.tenant_id == tenant.id,
                MemoryRecord.connector_id == connector_config.id,
                MemoryRecord.external_id == mem.external_id,
            )
        )
        if existing.scalar_one_or_none():
            continue
        fact_type, _ = classify_fact_type(mem.content)
        db.add(MemoryRecord(
            tenant_id=tenant.id,
            connector_id=connector_config.id,
            external_id=mem.external_id,
            content=mem.content,
            fact_type=fact_type,
            source_metadata={"source_type": mem.source_type, **(mem.metadata or {})},
        ))
        synced += 1

    connector_config.last_sync_at = datetime.now(timezone.utc)
    await db.flush()
    return {"status": "completed", "connector_id": str(connector_config.id), "synced": synced}


async def _get_connector_or_404(connector_id: uuid.UUID, tenant_id: uuid.UUID, db: AsyncSession) -> ConnectorConfig:
    connector = await db.get(ConnectorConfig, connector_id)
    if not connector or connector.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Connector not found")
    return connector
