import hashlib
import uuid
from collections.abc import AsyncGenerator

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.config import settings
from src.models.tenant import Tenant

engine = create_async_engine(settings.database_url, echo=(settings.memguard_env == "development"))
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Demo tenant for development — bypasses auth when MEMGUARD_ENV=development
DEMO_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def hash_api_key(key: str) -> str:
    """Hash an API key using SHA-256."""
    return hashlib.sha256(key.encode()).hexdigest()


def verify_api_key(key: str, key_hash: str) -> bool:
    """Verify an API key against its hash."""
    return hashlib.sha256(key.encode()).hexdigest() == key_hash


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_tenant(
    request: Request,
    x_api_key: str = Header(None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db),
) -> Tenant:
    """Resolve tenant from API key. In development mode, returns a demo tenant."""
    if settings.memguard_env == "development" and not x_api_key:
        # Auto-create or fetch demo tenant for dev
        result = await db.execute(select(Tenant).where(Tenant.id == DEMO_TENANT_ID))
        tenant = result.scalar_one_or_none()
        if not tenant:
            tenant = Tenant(
                id=DEMO_TENANT_ID,
                name="Demo Tenant",
                api_key_hash=hash_api_key("demo-api-key"),
            )
            db.add(tenant)
            await db.flush()
        request.state.tenant_id = tenant.id
        return tenant

    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")

    # Look up tenant by checking API key hash
    result = await db.execute(select(Tenant))
    tenants = result.scalars().all()
    for tenant in tenants:
        if verify_api_key(x_api_key, tenant.api_key_hash):
            request.state.tenant_id = tenant.id
            return tenant

    raise HTTPException(status_code=401, detail="Invalid API key")


def get_tenant_id(request: Request) -> uuid.UUID:
    """Extract tenant_id from request state. Must be called after get_tenant."""
    return request.state.tenant_id
