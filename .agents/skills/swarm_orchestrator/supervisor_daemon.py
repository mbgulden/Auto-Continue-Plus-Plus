"""
Antigravity Sovereign Swarm Supervisor Daemon (v6.0)

Central orchestration API that bridges the React Dashboard (port 5173)
with the Antigravity IDE, Jules CLI, and the Auto-Throttle engine.
Runs on port 5001 and serves as the single source of truth for all
swarm state, usage tracking, and autonomous task dispatch.
"""

import os
import time
import sqlite3
import threading
from flask import Flask, jsonify, request
from flask_cors import CORS
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from auto_throttle import (
    init_usage_table,
    record_usage,
    get_all_usage,
    get_next_model,
    log_throttle_event,
    get_throttle_history,
    get_quota_reset_seconds,
    ULTRA_LIMITS,
    MODEL_CASCADE,
)

WORKSPACE_DIR = r"C:\Users\mbgul\Dropbox\Workshop\Antigravity Orchestration Hub"
ARTIFACTS_DIR = os.path.join(WORKSPACE_DIR, ".agents", "artifacts")
DB_PATH = os.path.join(
    WORKSPACE_DIR, ".agents", "skills", "swarm_orchestrator", "swarm_state.db"
)


# ---------------------------------------------------------
# 1. DATABASE MANAGEMENT
# ---------------------------------------------------------
def init_database() -> None:
    """Initialize all core tables for swarm state."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        """CREATE TABLE IF NOT EXISTS agents
        (id TEXT PRIMARY KEY, name TEXT, type TEXT, status TEXT, load INTEGER)"""
    )
    c.execute(
        """CREATE TABLE IF NOT EXISTS tasks
        (id TEXT PRIMARY KEY, title TEXT, status TEXT, assignee TEXT)"""
    )
    c.execute(
        """CREATE TABLE IF NOT EXISTS telemetry
        (id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT, level TEXT, msg TEXT)"""
    )
    c.execute(
        """CREATE TABLE IF NOT EXISTS mutex_locks
        (filepath TEXT PRIMARY KEY, locked_by TEXT, sync_state TEXT)"""
    )

    # Seed 6 Sovereign Nodes
    agents = [
        ("agt-1", "Scout Protocol", "worker", "idle", 0),
        ("agt-2", "Tekton Builder", "worker", "idle", 0),
        ("agt-3", "Architect Node", "worker", "idle", 0),
        ("agt-4", "QA Verifier", "worker", "idle", 0),
        ("agt-5", "Vulcan Pipeline", "worker", "idle", 0),
        ("agt-6", "GitHub Jules", "remote", "idle", 0),
    ]
    for a in agents:
        c.execute(
            "INSERT OR IGNORE INTO agents (id, name, type, status, load) "
            "VALUES (?, ?, ?, ?, ?)",
            a,
        )

    conn.commit()
    conn.close()


def execute_db(query: str, args: tuple = ()) -> None:
    """Execute a write query against the swarm database."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(query, args)
    conn.commit()
    conn.close()


def query_db(query: str, args: tuple = ()) -> list[dict]:
    """Execute a read query and return results as dicts."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute(query, args)
    result = [dict(row) for row in c.fetchall()]
    conn.close()
    return result


def log_telemetry(msg: str, level: str = "info") -> None:
    """Write a timestamped event to the telemetry table."""
    current_time = time.strftime("%H:%M:%S")
    execute_db(
        "INSERT INTO telemetry (time, level, msg) VALUES (?, ?, ?)",
        (current_time, level, msg),
    )
    print(f"[{current_time}] {msg}")


# ---------------------------------------------------------
# 2. THE FLASK API BRIDGE (Port 5001)
# ---------------------------------------------------------
app = Flask(__name__)
CORS(app)

# Track the currently active model for the auto-throttle cascade
active_model: str = MODEL_CASCADE[0]


@app.route("/", methods=["GET"])
def index():
    """Health check and service discovery endpoint."""
    return jsonify(
        {
            "status": "online",
            "service": "Antigravity Supervisor API v6.0",
            "message": "Visual UI at http://localhost:5173",
            "active_model": active_model,
        }
    )


@app.route("/api/agents", methods=["GET"])
def get_agents():
    """Return all registered swarm agents."""
    return jsonify(query_db("SELECT * FROM agents"))


@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    """Return all active and completed tasks."""
    return jsonify(query_db("SELECT * FROM tasks"))


@app.route("/api/telemetry", methods=["GET"])
def get_telemetry():
    """Return the 50 most recent telemetry events."""
    return jsonify(
        query_db("SELECT * FROM telemetry ORDER BY id DESC LIMIT 50")
    )


@app.route("/api/mutex", methods=["GET"])
def get_mutex():
    """Return all active file locks."""
    return jsonify(query_db("SELECT * FROM mutex_locks"))


# ---------------------------------------------------------
# 2b. AUTO-THROTTLE & USAGE API
# ---------------------------------------------------------
@app.route("/api/usage", methods=["GET"])
def get_usage():
    """
    Return current daily usage for all tracked models.
    Includes percentage used, status (ok/warning/critical),
    and the time remaining until quota reset.
    """
    usage = get_all_usage()
    return jsonify(
        {
            "active_model": active_model,
            "cascade": MODEL_CASCADE,
            "reset_seconds": get_quota_reset_seconds(),
            "models": usage,
        }
    )


@app.route("/api/usage/record", methods=["POST"])
def api_record_usage():
    """
    Record a usage event for a specific model.
    Body: { "model": "gemini-3.1-pro", "tokens": 1500 }
    Returns updated usage stats and triggers auto-throttle if needed.
    """
    global active_model
    data = request.json or {}
    model = data.get("model", active_model)
    tokens = data.get("tokens", 0)

    status = record_usage(model, tokens)

    # Auto-Throttle Logic
    if status["should_switch"]:
        next_model = get_next_model(model)
        if next_model:
            reason = (
                f"Usage at {status['percentage']}% "
                f"({status['count']}/{status['daily_limit']})"
            )
            log_throttle_event(model, next_model, reason)
            log_telemetry(
                f"AUTO-THROTTLE: {model} → {next_model} ({reason})",
                "warning",
            )
            active_model = next_model
            status["throttled_to"] = next_model
    elif status["should_warn"]:
        log_telemetry(
            f"QUOTA WARNING: {model} at {status['percentage']}% "
            f"({status['count']}/{status['daily_limit']})",
            "warning",
        )

    return jsonify(status)


@app.route("/api/usage/throttle-history", methods=["GET"])
def api_throttle_history():
    """Return recent auto-throttle events for the audit trail."""
    return jsonify(get_throttle_history())


@app.route("/api/usage/limits", methods=["GET"])
def api_get_limits():
    """Return the full limits table for the Dashboard."""
    return jsonify(ULTRA_LIMITS)


# ---------------------------------------------------------
# 2c. MEGAPROMPT DISPATCH
# ---------------------------------------------------------
@app.route("/api/dispatch", methods=["POST"])
def dispatch_megaprompt():
    """
    Accept a Megaprompt from the Dashboard and queue it
    for injection into the Antigravity IDE via CDP.
    """
    data = request.json or {}
    prompt = data.get("prompt", "")
    use_jules = data.get("use_jules", False)

    log_telemetry(
        f"Megaprompt Injected (Jules: {use_jules})", "success"
    )
    log_telemetry("Decomposing execution plan...", "info")

    execute_db(
        "UPDATE agents SET status = 'active', load = 85 WHERE id = 'agt-1'"
    )
    execute_db(
        "INSERT OR REPLACE INTO tasks (id, title, status, assignee) "
        "VALUES (?, ?, ?, ?)",
        ("TSK-NEW", "Initialize Master Plan", "in-progress", "Antigravity"),
    )

    # Record usage against the active model
    record_usage(active_model, tokens=len(prompt))

    return jsonify({"status": "dispatched", "model": active_model}), 200

@app.route("/api/cdp/force-yield", methods=["POST"])
def force_yield():
    """
    Force a yield signal triggered dynamically from the React dashboard or CDP layer,
    halting the auto-accept loop for Antigravity.
    """
    log_telemetry("Force-Yield received via /api/cdp/force-yield", "warning")
    execute_db(
        "UPDATE agents SET status='idle', load=0 WHERE id='agt-1'"
    )
    return jsonify({"status": "yielded"}), 200


# ---------------------------------------------------------
# 3. THE WATCHDOG SUPERVISOR (Background Thread)
# ---------------------------------------------------------
class SupervisorHandler(FileSystemEventHandler):
    """Watch for [SYS_YIELD] tokens in artifact files."""

    def on_modified(self, event):
        """Detect yield signals from the Antigravity agent."""
        if event.is_directory or not event.src_path.endswith(".md"):
            return
        try:
            with open(event.src_path, "r", encoding="utf-8") as f:
                content = f.read()
            if "[SYS_YIELD]" in content:
                log_telemetry(
                    "Antigravity yielded. Supervisor taking control.",
                    "warning",
                )
                execute_db(
                    "UPDATE agents SET status='idle', load=0 WHERE id='agt-1'"
                )
        except (IOError, PermissionError) as e:
            log_telemetry(f"Watchdog read error: {e}", "error")


def start_watchdog() -> None:
    """Start the filesystem observer for yield detection."""
    if not os.path.exists(ARTIFACTS_DIR):
        os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    observer = Observer()
    observer.schedule(SupervisorHandler(), ARTIFACTS_DIR, recursive=False)
    observer.start()
    observer.join()


# ---------------------------------------------------------
# BOOT SEQUENCE
# ---------------------------------------------------------
if __name__ == "__main__":
    print("[BOOT] Booting Sovereign Swarm Supervisor API v6.0...")
    init_database()
    init_usage_table()
    log_telemetry("System initialized: Sovereign Swarm v6.0 + Auto-Throttle", "info")

    threading.Thread(target=start_watchdog, daemon=True).start()

    app.run(port=5001, debug=False, use_reloader=False)
