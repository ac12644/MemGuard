from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

import structlog

logger = structlog.get_logger()


class MemGuardError(Exception):
    """Base exception for MemGuard."""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class ConnectorError(MemGuardError):
    """Error communicating with a memory system connector."""

    def __init__(self, message: str):
        super().__init__(message, status_code=502)


class ValidationError(MemGuardError):
    """Error during memory validation."""

    def __init__(self, message: str):
        super().__init__(message, status_code=422)


class RateLimitError(MemGuardError):
    """Rate limit exceeded."""

    def __init__(self, message: str = "Rate limit exceeded"):
        super().__init__(message, status_code=429)


async def memguard_exception_handler(request: Request, exc: MemGuardError) -> JSONResponse:
    logger.error("memguard_error", error=exc.message, status=exc.status_code, path=request.url.path)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("unhandled_error", error=str(exc), path=request.url.path, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
