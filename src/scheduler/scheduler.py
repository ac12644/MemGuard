"""Celery beat schedule management.

The schedule is configured directly in tasks.py via app.conf.beat_schedule.
This module provides helpers for dynamic schedule management.
"""

from src.scheduler.tasks import app


def get_current_schedule() -> dict:
    """Return the current beat schedule."""
    return dict(app.conf.beat_schedule or {})


def add_schedule(name: str, task: str, schedule, kwargs: dict | None = None) -> None:
    """Dynamically add a schedule entry."""
    current = dict(app.conf.beat_schedule or {})
    current[name] = {
        "task": task,
        "schedule": schedule,
        "kwargs": kwargs or {},
    }
    app.conf.beat_schedule = current


def remove_schedule(name: str) -> bool:
    """Remove a schedule entry by name."""
    current = dict(app.conf.beat_schedule or {})
    if name in current:
        del current[name]
        app.conf.beat_schedule = current
        return True
    return False
