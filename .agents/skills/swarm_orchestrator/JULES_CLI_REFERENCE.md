# Jules CLI Autonomous Reference Manual

This Reference Guide serves as the authoritative memory bank for the Antigravity Swarm Orchestrator and the Python Supervisor Daemon to autonomously dictate interactions with GitHub Jules via the `jules` CLI.

## 1. Global Setup & Commands
The `jules` binary must be available on the active terminal path.
* **Version Check:** `jules version`
* **Theme Enforcement (For UI Streams):** `jules --theme dark` OR `jules --theme light`
* **Shell Completion Generation:** `jules completion bash`

## 2. Remote Session Management
Jules operates exclusively over remote cloud sessions against synchronized GitHub repositories. 

* **List Connected Repositories:**
  ```bash
  jules remote list --repo
  ```
  *(Used by Antigravity to verify the current workspace has an established GitHub linkage before injecting tasks).*

* **List Active/Historical Sessions:**
  ```bash
  jules remote list --session
  ```
  *(Used by the Python Supervisor Daemon to query the completion state of a pending background evaluation).*

## 3. Remote Execution 
Antigravity and Gemini can delegate tasks to Jules using `remote new`. Because Jules interprets context structurally, you must format prompts accurately.

* **Standard Injection:**
  ```bash
  jules remote new --repo . --session "Your specific task or review instruction here"
  ```
  *Note: Using `--repo .` automatically binds to the current working directory. You must have already executed `git push` on your code before calling this.*

* **Parallel Execution (Swarm Multiplication):**
  If Antigravity decomposes a massive task that can be addressed concurrently across the repo, inject it with the parallel flag to spawn multiple isolated cloud workers:
  ```bash
  jules remote new --repo torvalds/linux --session "Refactor all auth bounds" --parallel 3
  ```

## 4. Retrieving Cloud State (The Synthesis)
Once a Jules session indicates completion, Antigravity MUST pull the modified tree down to local disk so that local React instances or unit tests can reflect the modifications.

* **State Pull:**
  ```bash
  jules remote pull --session <session_id>
  ```
  *The `<session_id>` is an integer natively output to `stdout` upon executing `remote new`.*

## 5. Advanced Autonomous Scripting (Piping)
Jules is natively built to handle `stdin` pipelines. The Antigravity Supervisor Daemon can execute native integrations by piping logic directly into Jules.

* **Mass Deployed TODOs via Watchdog:**
  Reads a markdown artifact line-by-line, sequentially deploying isolated sessions for each line:
  ```bash
  cat ARTIFACT.md | while IFS= read -r line; do jules remote new --repo . --session "$line"; done
  ```

* **GitHub Issue Ingestion (`gh` + `jq`):**
  Using the native `gh` CLI, query specific issues and pass the title seamlessly into Jules execution:
  ```bash
  gh issue list --assignee @me --limit 1 --json title | jq -r '.[0].title' | jules remote new --repo .
  ```

* **Gemini Pre-Processing (Dialectic Layering):**
  You can use the local Gemini CLI natively to process fuzzy structural data before generating the strict formal prompt for Jules:
  ```bash
  gemini -p "find the most tedious issue, print it verbatim\n$(gh issue list)" | jules remote new --repo .
  ```
