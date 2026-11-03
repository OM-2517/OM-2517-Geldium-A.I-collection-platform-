"""Small SQLite store for reversible demo workflow state."""

from __future__ import annotations

import os
import sqlite3
from threading import Lock
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("GELDIUM_DB_PATH", str(BASE_DIR / "data" / "geldium_demo.sqlite3")))
_SCHEMA_READY = False
_SCHEMA_LOCK = Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    _ensure_schema()
    connection = sqlite3.connect(DB_PATH, timeout=5)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 5000")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _ensure_schema() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return
        connection = sqlite3.connect(DB_PATH, timeout=5)
        try:
            connection.execute("PRAGMA busy_timeout = 5000")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS review_state (
                    customer_id TEXT PRIMARY KEY,
                    reviewed INTEGER NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS review_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_id TEXT NOT NULL,
                    reviewed INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS validation_state (
                    task_id TEXT PRIMARY KEY,
                    completed INTEGER NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            connection.commit()
            _SCHEMA_READY = True
        finally:
            connection.close()


def list_reviews() -> dict[str, Any]:
    with _connect() as connection:
        states = connection.execute(
            "SELECT customer_id, reviewed, updated_at FROM review_state ORDER BY customer_id"
        ).fetchall()
        events = connection.execute(
            "SELECT customer_id, reviewed, created_at FROM review_events ORDER BY id DESC LIMIT 12"
        ).fetchall()
    return {
        "items": [dict(row) for row in states],
        "events": [dict(row) for row in events],
    }


def set_review(customer_id: str, reviewed: bool) -> dict[str, Any]:
    updated_at = _now()
    with _connect() as connection:
        connection.execute(
            "INSERT INTO review_state (customer_id, reviewed, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(customer_id) DO UPDATE SET reviewed=excluded.reviewed, updated_at=excluded.updated_at",
            (customer_id, int(reviewed), updated_at),
        )
        connection.execute(
            "INSERT INTO review_events (customer_id, reviewed, created_at) VALUES (?, ?, ?)",
            (customer_id, int(reviewed), updated_at),
        )
        connection.execute(
            "DELETE FROM review_events WHERE id <= "
            "(SELECT id FROM review_events ORDER BY id DESC LIMIT 1 OFFSET 1000)"
        )
    return {"customer_id": customer_id, "reviewed": reviewed, "updated_at": updated_at}


def clear_reviews() -> None:
    with _connect() as connection:
        connection.execute("DELETE FROM review_state")
        connection.execute("DELETE FROM review_events")


def operations_summary(validation_task_count: int) -> dict[str, Any]:
    with _connect() as connection:
        reviewed_count = connection.execute(
            "SELECT COUNT(*) FROM review_state WHERE reviewed = 1"
        ).fetchone()[0]
        validation_count = connection.execute(
            "SELECT COUNT(*) FROM validation_state WHERE completed = 1"
        ).fetchone()[0]
        event_count = connection.execute("SELECT COUNT(*) FROM review_events").fetchone()[0]
        last_event = connection.execute(
            "SELECT created_at FROM review_events ORDER BY id DESC LIMIT 1"
        ).fetchone()
    return {
        "reviewed_customers": reviewed_count,
        "completed_validation_tasks": validation_count,
        "validation_task_count": validation_task_count,
        "review_activity_events": event_count,
        "last_review_activity_at": last_event[0] if last_event else None,
        "state_store": "sqlite",
    }


def list_validation(task_ids: list[str]) -> dict[str, Any]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT task_id, completed, updated_at FROM validation_state"
        ).fetchall()
    stored = {row["task_id"]: dict(row) for row in rows}
    return {
        "items": [
            {
                "task_id": task_id,
                "completed": bool(stored.get(task_id, {}).get("completed", False)),
                "updated_at": stored.get(task_id, {}).get("updated_at"),
            }
            for task_id in task_ids
        ]
    }


def set_validation(task_id: str, completed: bool) -> dict[str, Any]:
    updated_at = _now()
    with _connect() as connection:
        connection.execute(
            "INSERT INTO validation_state (task_id, completed, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(task_id) DO UPDATE SET completed=excluded.completed, updated_at=excluded.updated_at",
            (task_id, int(completed), updated_at),
        )
    return {"task_id": task_id, "completed": completed, "updated_at": updated_at}


def clear_validation() -> None:
    with _connect() as connection:
        connection.execute("DELETE FROM validation_state")
