import time

import redis.asyncio as aioredis
import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from src.config import settings

logger = structlog.get_logger()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Redis-based rate limiting per tenant. Applies to /api/ routes only."""

    def __init__(self, app, requests_per_minute: int = 120):
        super().__init__(app)
        self.rpm = requests_per_minute
        self._redis = None

    async def _get_redis(self):
        if self._redis is None:
            self._redis = aioredis.from_url(settings.redis_url)
        return self._redis

    async def dispatch(self, request: Request, call_next) -> Response:
        # Only rate-limit API routes
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        # Use API key or IP as rate limit key
        api_key = request.headers.get("X-API-Key", "")
        key = f"ratelimit:{api_key or request.client.host}" if request.client else f"ratelimit:{api_key}"

        try:
            r = await self._get_redis()
            window = int(time.time()) // 60  # 1-minute window
            rate_key = f"{key}:{window}"

            count = await r.incr(rate_key)
            if count == 1:
                await r.expire(rate_key, 120)  # Expire after 2 minutes

            if count > self.rpm:
                return Response(
                    content='{"detail":"Rate limit exceeded"}',
                    status_code=429,
                    media_type="application/json",
                    headers={"Retry-After": "60", "X-RateLimit-Limit": str(self.rpm)},
                )

            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(self.rpm)
            response.headers["X-RateLimit-Remaining"] = str(max(0, self.rpm - count))
            return response
        except Exception:
            # If Redis is down, don't block requests
            logger.warning("rate_limit_redis_unavailable")
            return await call_next(request)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log all requests with structured logging."""

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = round((time.monotonic() - start) * 1000, 2)

        if request.url.path not in ("/health", "/docs", "/openapi.json", "/redoc"):
            logger.info(
                "http_request",
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                duration_ms=duration_ms,
            )
        return response
