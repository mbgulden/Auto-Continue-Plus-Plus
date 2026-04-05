"""
Auto-Throttle Engine for Google AI Ultra Subscription.

Tracks per-model usage against known daily limits and automatically
cascades to cheaper models before hitting rate caps. Exposes usage
data via the Supervisor Daemon's Flask API for the Dashboard.

Why this exists: Google enforces hard daily caps (e.g. 500 Pro 3.1
prompts/day on Ultra). Hitting those caps halts all autonomous work.
This module prevents that by proactively downshifting models.
"""

import time
import sqlite3
import os
from typing import Optional

DB_PATH = os.path.join(
    os.path.dirname(__file__), "swarm_state.db"
)

# ---------------------------------------------------------
# GOOGLE AI ULTRA DAILY LIMITS (Verified April 2026)
# Source: https://support.google.com/gemini/answer/16275805
# ---------------------------------------------------------
ULTRA_LIMITS: dict[str, dict[str, int]] = {
    "gemini-3.1-pro": {
        "prompts_per_day": 500,
        "context_window": 1_000_000,
    },
    "gemini-thinking": {
        "prompts_per_day": 1500,
        "context_window": 1_000_000,
    },
    "gemini-3-flash": {
        "prompts_per_day": 99999,  # Effectively unlimited
        "context_window": 1_000_000,
    },
    "gemini-2.5-flash": {
        "prompts_per_day": 99999,
        "context_window": 1_000_000,
    },
    "gemini-2.5-flash-lite": {
        "prompts_per_day": 99999,
        "context_window": 1_000_000,
    },
    "deep-research": {
        "prompts_per_day": 120,
        "context_window": 0,
    },
    "deep-think-3.1": {
        "prompts_per_day": 10,
        "context_window": 192_000,
    },
    "gemini-agent": {
        "prompts_per_day": 200,
        "context_window": 0,
    },
    "screen-automation": {
        "prompts_per_day": 120,
        "context_window": 0,
    },
    "image-gen": {
        "prompts_per_day": 1000,
        "context_window": 0,
    },
    "video-gen": {
        "prompts_per_day": 5,
        "context_window": 0,
    },
}

# Fallback cascade: when one model hits its cap, drop to the next
MODEL_CASCADE: list[str] = [
    "gemini-3.1-pro",
    "gemini-thinking",
    "gemini-3-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
]

WARN_THRESHOLD = 0.85  # 85% — emit a warning
SWITCH_THRESHOLD = 0.95  # 95% — force model switch


def init_usage_table() -> None:
    """Create the usage tracking table if it doesn't exist."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS usage_tracking (
        model TEXT NOT NULL,
        date TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        tokens_used INTEGER DEFAULT 0,
        PRIMARY KEY (model, date)
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS throttle_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        from_model TEXT NOT NULL,
        to_model TEXT NOT NULL,
        reason TEXT
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS limits_snapshot (
        model TEXT PRIMARY KEY,
        daily_limit INTEGER,
        last_updated TEXT
    )''')
    conn.commit()
    conn.close()


def get_today() -> str:
    """Return today's date in YYYY-MM-DD format for partitioning usage."""
    return time.strftime('%Y-%m-%d')


def record_usage(model: str, tokens: int = 0) -> dict:
    """
    Increment usage counter for a model and return current status.

    Returns a dict with: count, limit, percentage, should_warn, should_switch
    """
    today = get_today()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute(
        "INSERT INTO usage_tracking (model, date, count, tokens_used) "
        "VALUES (?, ?, 1, ?) "
        "ON CONFLICT(model, date) DO UPDATE SET "
        "count = count + 1, tokens_used = tokens_used + ?",
        (model, today, tokens, tokens)
    )
    conn.commit()

    c.execute(
        "SELECT count, tokens_used FROM usage_tracking "
        "WHERE model = ? AND date = ?",
        (model, today)
    )
    row = c.fetchone()
    conn.close()

    current_count = row[0] if row else 0
    current_tokens = row[1] if row else 0
    limit_info = ULTRA_LIMITS.get(model, {"prompts_per_day": 99999})
    daily_limit = limit_info["prompts_per_day"]
    pct = current_count / daily_limit if daily_limit > 0 else 0.0

    return {
        "model": model,
        "count": current_count,
        "tokens_used": current_tokens,
        "daily_limit": daily_limit,
        "percentage": round(pct * 100, 1),
        "should_warn": pct >= WARN_THRESHOLD,
        "should_switch": pct >= SWITCH_THRESHOLD,
    }


def get_all_usage() -> list[dict]:
    """Return usage stats for all tracked models today."""
    today = get_today()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute(
        "SELECT model, count, tokens_used FROM usage_tracking WHERE date = ?",
        (today,)
    )
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    result = []
    for model_id, limits in ULTRA_LIMITS.items():
        entry = next((r for r in rows if r["model"] == model_id), None)
        count = entry["count"] if entry else 0
        tokens = entry["tokens_used"] if entry else 0
        daily_limit = limits["prompts_per_day"]
        pct = (count / daily_limit * 100) if daily_limit > 0 else 0.0

        result.append({
            "model": model_id,
            "count": count,
            "tokens_used": tokens,
            "daily_limit": daily_limit,
            "percentage": round(pct, 1),
            "status": "critical" if pct >= 95 else "warning" if pct >= 85 else "ok",
        })

    return result


def get_next_model(current: str) -> Optional[str]:
    """Get the next model in the fallback cascade."""
    try:
        idx = MODEL_CASCADE.index(current)
        if idx + 1 < len(MODEL_CASCADE):
            return MODEL_CASCADE[idx + 1]
    except ValueError:
        pass
    return None


def log_throttle_event(from_model: str, to_model: str, reason: str) -> None:
    """Record a model switch event for the audit trail."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "INSERT INTO throttle_events (timestamp, from_model, to_model, reason) "
        "VALUES (?, ?, ?, ?)",
        (time.strftime('%Y-%m-%d %H:%M:%S'), from_model, to_model, reason)
    )
    conn.commit()
    conn.close()


def get_throttle_history(limit: int = 20) -> list[dict]:
    """Return recent throttle events for the Dashboard."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute(
        "SELECT * FROM throttle_events ORDER BY id DESC LIMIT ?",
        (limit,)
    )
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


def get_quota_reset_seconds() -> int:
    """Seconds until midnight Pacific Time (when Google resets quotas)."""
    import datetime
    try:
        from zoneinfo import ZoneInfo
        pacific = ZoneInfo("America/Los_Angeles")
    except ImportError:
        # Fallback: assume UTC-7 offset
        pacific = datetime.timezone(datetime.timedelta(hours=-7))

    now = datetime.datetime.now(pacific)
    midnight = now.replace(
        hour=0, minute=0, second=0, microsecond=0
    ) + datetime.timedelta(days=1)
    return int((midnight - now).total_seconds())
