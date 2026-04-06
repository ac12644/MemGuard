import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel as PydanticBase
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_tenant
from src.models.tenant import Tenant
from src.models.webhook import Webhook

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

VALID_EVENTS = [
    "memory.flagged",
    "memory.quarantined",
    "memory.validated",
    "memory.restored",
    "validation.completed",
    "health.degraded",
]


class WebhookCreate(PydanticBase):
    url: str
    events: list[str]
    secret: str | None = None


class WebhookResponse(PydanticBase):
    id: uuid.UUID
    url: str
    events: list[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("", response_model=WebhookResponse, status_code=201)
async def create_webhook(
    body: WebhookCreate,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> Webhook:
    """Register a webhook endpoint."""
    invalid = [e for e in body.events if e not in VALID_EVENTS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid events: {invalid}. Valid: {VALID_EVENTS}")

    webhook = Webhook(
        tenant_id=tenant.id,
        url=body.url,
        events=body.events,
        secret=body.secret,
    )
    db.add(webhook)
    await db.flush()
    await db.refresh(webhook)
    return webhook


@router.get("", response_model=list[WebhookResponse])
async def list_webhooks(
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[Webhook]:
    """List registered webhooks."""
    result = await db.execute(
        select(Webhook).where(Webhook.tenant_id == tenant.id).order_by(Webhook.created_at)
    )
    return list(result.scalars().all())


@router.delete("/{webhook_id}", status_code=204)
async def delete_webhook(
    webhook_id: uuid.UUID,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a webhook."""
    webhook = await db.get(Webhook, webhook_id)
    if not webhook or webhook.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await db.delete(webhook)
