---
name: Swarm Orchestrator & Jules Integration
description: "Master Skill for Antigravity: Enables Megaprompt decomposition, explicit yielding for the Supervisor Daemon, and automated GitHub Jules code reviews via CLI."
---

# Swarm Orchestrator & Jules Dialectic Loop

This skill enforces the communication protocol between the Antigravity Agent, the Python Supervisor Daemon (`supervisor_daemon.py`), and GitHub Jules (`jules`). 

## 1. The Yield Contract (Mandatory)
Antigravity does NOT rely on visual UI markers to yield control to the Supervisor. You are strictly operating under a mathematical yield contract.
- NEVER end a generation stream ambiguously if you need the Supervisor to step in.
- **Rule:** Whenever you have finished a task, completed code modifications, or require the Supervisor/Jules to review your work, your final output MUST end with the exact literal string: `[SYS_YIELD]`

## 2. Megaprompt Execution
When the user gives a Megaprompt (e.g., `/swarm refactor entire project`):
1. Break down the task into sub-tasks.
2. Formulate a plan and log it to `.agents/artifacts/swarm_dashboard.md` so the user's React Dashboard can display it.
3. Execute the changes locally.
4. When finished with the phase, append `[SYS_YIELD]`.

## 3. GitHub Jules Integration (CLI Operations)
Jules is a cloud-hosted remote agent that strictly reviews and writes code against the **remote GitHub repository**, NOT your local uncommitted files.
If the Supervisor requests Jules, or if you decide Jules is required for complex refactoring, **you must execute the following sequence**:

### Step 1: Push Local State
Jules CANNOT see local changes. Before invoking Jules, you must backup and push all current code to the remote repository.
```bash
git add .
git commit -m "Auto-checkpoint: Preparing for Jules Review"
git push
```

### Step 2: Spawn Jules Session
Start a remote session delegating the task to Jules. Since Jules automatically infers the repository from your current directory, you can use `.`. 
You MUST capture the `<session_id>` returned by this command!
```bash
jules remote new --repo . --session "Review the recent changes to the Auth components for security vulnerabilities and optimize the CSS."
```

### Step 3: Pull Jules' Modifications
Once Jules has completed the task in the cloud, you must pull those changes back down into the local workspace so Antigravity and the user can see them.
*(Replace `<session_id>` with the ID output from Step 2)*.
```bash
jules remote pull --session <session_id>
```

## Jules Command Line Reference (For AI Context)
If you need to query active sessions or format commands, use the `jules remote` interface:
- `jules remote list --repo` : Lists all connected repositories.
- `jules remote list --session` : Lists your active and past sessions.
- `jules remote new --repo <repo_name> --session "<prompt>"` : Starts a session.
- `jules remote pull --session <session_id>` : Pulls code configurations from Jules onto local disk.

## 4. The Loop
Once Jules' modifications are pulled down via `jules remote pull`, read the code diffs briefly to ensure context alignment, update the `SWARM_DASHBOARD.md`, and yield `[SYS_YIELD]` so the Python Supervisor can signal the React frontend.
