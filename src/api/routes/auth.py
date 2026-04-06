import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, hash_api_key

from src.models.tenant import Tenant

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Tenant/organization name")


class RegisterResponse(BaseModel):
    tenant_id: str
    name: str
    api_key: str
    message: str


class LoginRequest(BaseModel):
    api_key: str


class LoginResponse(BaseModel):
    tenant_id: str
    name: str
    authenticated: bool


@router.post("/register", response_model=RegisterResponse, status_code=201)
async def register_tenant(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> dict:
    """Register a new tenant. Returns a one-time API key — store it safely."""
    # Check for duplicate name
    existing = await db.execute(select(Tenant).where(Tenant.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Tenant '{body.name}' already exists")

    raw_key = f"mg_{secrets.token_urlsafe(32)}"
    tenant = Tenant(
        name=body.name,
        api_key_hash=hash_api_key(raw_key),
    )
    db.add(tenant)
    await db.flush()
    await db.refresh(tenant)

    return {
        "tenant_id": str(tenant.id),
        "name": tenant.name,
        "api_key": raw_key,
        "message": "Store this API key securely. It will not be shown again.",
    }


@router.post("/verify", response_model=LoginResponse)
async def verify_api_key(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> dict:
    """Verify an API key and return tenant info."""
    key_hash = hash_api_key(body.api_key)
    result = await db.execute(select(Tenant).where(Tenant.api_key_hash == key_hash))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=401, detail="Invalid API key")

    return {
        "tenant_id": str(tenant.id),
        "name": tenant.name,
        "authenticated": True,
    }
