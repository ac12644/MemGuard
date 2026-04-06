import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.api.exceptions import (
    MemGuardError,
    generic_exception_handler,
    http_exception_handler,
    memguard_exception_handler,
)
from src.api.middleware import RateLimitMiddleware, RequestLoggingMiddleware, SecurityHeadersMiddleware
from src.api.router import api_router
from src.config import settings

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.ConsoleRenderer()
        if settings.memguard_env == "development"
        else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(0),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

app = FastAPI(
    title="MemGuard",
    description="AI Agent Memory Validation Platform",
    version="0.1.0",
)

# Exception handlers
app.add_exception_handler(MemGuardError, memguard_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# Middleware (order matters — outermost first)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RateLimitMiddleware, requests_per_minute=120)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.on_event("startup")
async def _startup_checks():
    log = structlog.get_logger()
    if settings.memguard_secret_key in ("change-me-in-production", "docker-dev-secret-change-in-prod"):
        if settings.memguard_env == "production":
            log.error("INSECURE: MEMGUARD_SECRET_KEY is set to default. Change it immediately.")
        else:
            log.warning("Default secret key in use. Set MEMGUARD_SECRET_KEY for production.")
    log.info(
        "memguard_started",
        env=settings.memguard_env,
        cors=settings.cors_origins,
    )
