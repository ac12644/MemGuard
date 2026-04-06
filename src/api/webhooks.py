import hashlib
import hmac
import json
import uuid

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.webhook import Webhook

logger = structlog.get_logger()


async def emit_webhook_event(
    tenant_id: uuid.UUID,
    event_type: str,
    payload: dict,
    db: AsyncSession,
) -> int:
    """Send webhook notifications for an event. Returns count of webhooks triggered."""
    result = await db.execute(
        select(Webhook).where(
            Webhook.tenant_id == tenant_id,
            Webhook.is_active.is_(True),
        )
    )
    webhooks = [w for w in result.scalars().all() if event_type in (w.events or [])]

    if not webhooks:
        return 0

    body = json.dumps({"event": event_type, "data": payload}, default=str)
    sent = 0

    async with httpx.AsyncClient(timeout=10.0) as client:
        for webhook in webhooks:
            headers: dict[str, str] = {"Content-Type": "application/json"}
            if webhook.secret:
                sig = hmac.new(webhook.secret.encode(), body.encode(), hashlib.sha256).hexdigest()
                headers["X-MemGuard-Signature"] = f"sha256={sig}"

            try:
                resp = await client.post(webhook.url, content=body, headers=headers)
                if resp.status_code >= 400:
                    logger.warning(
                        "webhook_delivery_failed",
                        webhook_id=str(webhook.id),
                        status=resp.status_code,
                    )
                else:
                    sent += 1
            except Exception as e:
                logger.error("webhook_delivery_error", webhook_id=str(webhook.id), error=str(e))

    return sent
