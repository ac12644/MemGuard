import secrets

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_tenant, hash_api_key
from src.config import settings as env_settings
from src.models.tenant import Tenant

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])

# These are the settings users can override per-tenant
DEFAULTS = {
    "trust_flag_threshold": env_settings.memguard_default_trust_threshold,
    "quarantine_threshold": env_settings.memguard_quarantine_threshold,
    "max_validation_batch": env_settings.memguard_max_validation_batch,
    "source_fetch_timeout": env_settings.memguard_source_fetch_timeout,
    "source_rate_limit_per_domain": env_settings.memguard_source_rate_limit_per_domain,
    "llm_rate_limit_rpm": env_settings.memguard_llm_rate_limit_rpm,
}


class SettingsUpdate(BaseModel):
    trust_flag_threshold: float | None = Field(None, ge=0.0, le=1.0)
    quarantine_threshold: float | None = Field(None, ge=0.0, le=1.0)
    max_validation_batch: int | None = Field(None, ge=1, le=1000)
    source_fetch_timeout: int | None = Field(None, ge=1, le=120)
    source_rate_limit_per_domain: int | None = Field(None, ge=1, le=100)
    llm_rate_limit_rpm: int | None = Field(None, ge=1, le=600)


@router.get("")
async def get_settings(
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get current settings (tenant overrides merged with defaults)."""
    overrides = tenant.settings or {}
    merged = {**DEFAULTS, **overrides}
    has_anthropic = bool(env_settings.anthropic_api_key) or bool((tenant.settings or {}).get("anthropic_key_set"))
    return {"settings": merged, "defaults": DEFAULTS, "overrides": overrides, "anthropic_key_configured": has_anthropic}


@router.put("")
async def update_settings(
    body: SettingsUpdate,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update tenant settings. Only provided fields are overridden."""
    current = dict(tenant.settings or {})
    updates = body.model_dump(exclude_none=True)
    current.update(updates)
    tenant.settings = current
    await db.flush()
    await db.refresh(tenant)

    merged = {**DEFAULTS, **tenant.settings}
    return {"settings": merged, "defaults": DEFAULTS, "overrides": tenant.settings}


@router.delete("")
async def reset_settings(
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Reset all settings to defaults."""
    tenant.settings = {}
    await db.flush()
    return {"settings": DEFAULTS, "defaults": DEFAULTS, "overrides": {}}


@router.post("/api-key")
async def regenerate_api_key(
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a new API key for the tenant. Returns the raw key once — store it safely."""
    raw_key = f"mg_{secrets.token_urlsafe(32)}"
    tenant.api_key_hash = hash_api_key(raw_key)
    await db.flush()
    return {
        "api_key": raw_key,
        "message": "Store this key securely. It will not be shown again.",
    }


@router.get("/api-key")
async def get_api_key_info(
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get masked API key info (not the actual key)."""
    return {
        "key_hash_prefix": tenant.api_key_hash[:12] + "...",
        "tenant_name": tenant.name,
        "tenant_id": str(tenant.id),
    }


class AnthropicKeyUpdate(BaseModel):
    anthropic_key: str = Field(..., min_length=10)


@router.put("/anthropic-key")
async def set_anthropic_key(
    body: AnthropicKeyUpdate,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Save Anthropic API key for LLM-based validation strategies."""
    from src.utils.crypto import encrypt_value
    current = dict(tenant.settings or {})
    current["anthropic_key_encrypted"] = encrypt_value(body.anthropic_key)
    current["anthropic_key_set"] = True
    tenant.settings = current
    await db.flush()
    msg = "Anthropic key configured. Semantic Drift and Causal Chain strategies are now available."
    return {"status": "saved", "message": msg}
