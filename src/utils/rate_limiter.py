import asyncio
import time
from collections import defaultdict


class RateLimiter:
    """Per-domain rate limiter using token bucket."""

    def __init__(self, max_per_second: int = 10) -> None:
        self.max_per_second = max_per_second
        self._tokens: dict[str, float] = defaultdict(lambda: float(max_per_second))
        self._last_refill: dict[str, float] = defaultdict(time.monotonic)
        self._lock = asyncio.Lock()

    async def acquire(self, domain: str) -> None:
        """Wait until a request slot is available for the given domain."""
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_refill[domain]
            self._tokens[domain] = min(
                float(self.max_per_second),
                self._tokens[domain] + elapsed * self.max_per_second,
            )
            self._last_refill[domain] = now

            if self._tokens[domain] < 1.0:
                wait_time = (1.0 - self._tokens[domain]) / self.max_per_second
                await asyncio.sleep(wait_time)
                self._tokens[domain] = 0.0
            else:
                self._tokens[domain] -= 1.0
