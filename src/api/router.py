from fastapi import APIRouter

from src.api.routes import analytics, audit, auth, connectors, health, memories, quarantine, settings, validation, webhooks

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(connectors.router)
api_router.include_router(memories.router)
api_router.include_router(validation.router)
api_router.include_router(quarantine.router)
api_router.include_router(audit.router)
api_router.include_router(analytics.router)
api_router.include_router(webhooks.router)
api_router.include_router(settings.router)
