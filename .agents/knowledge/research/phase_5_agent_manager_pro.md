# Phase 5 & 6: Agent Manager Pro & Universal Skills

## The Vision
The MVP Swarm Manager proved that we can securely route tasks to distinct AI heads (Antigravity IDE UI, Headless API, Local AI) while maintaining strict Zero-Trust boundaries via `SwarmLockManager` and `ContractManager`.

Now, we need to build the "Command Center"—**Agent Manager Pro**. This dashboard transforms the extension from a simple task router into a continuous, real-time autonomous development agency.

### Core Philosophy
1. **Single-Pane-of-Glass:** No pagination. No context switching. A single React SPA (Single Page Application) injected into the VS Code Webview.
2. **"Google Calendar for AI":** Agents aren't just one-off script runners; they are scheduled employees.
3. **Universal Portability (Skills):** "Bolt-Ons" evolve into a universal adapter pattern, capable of running native TypeScript skills, MCP (Model Context Protocol) servers, and external vocabularies like Moltbook.

---

## Phase 5: The "Agent Manager Pro" Dashboard

### Module 5.1: The React SPA Foundation
Currently, `SwarmWebview` and `DashboardWebview` use raw template-literal HTML strings. This does not scale to interactive drag-and-drop calendars.
- **Goal:** Introduce a lightweight build step to compile a React frontend into the Webview.
- **Libraries:** React, `react-beautiful-dnd` (for Kanban task dragging), `react-big-calendar` (for the AI Schedule), and standard VS Code Webview UI Toolkit components.

### Module 5.2: Real-Time Fleet Telemetry
We must fix the "blind execution" feel of background agents.
- **Goal:** Establish a bidirectional WebSocket or `vscode.postMessage` stream between the `SwarmOrchestrator` and the React SPA.
- **Features:**
  - Live console output streaming from Headless API workers directly into the dashboard popovers.
  - Active "Agent Cards" showing:
    - **Category:** Antigravity (Gemini 1.5 Pro), Headless API (Claude 3.5 Sonnet), Local AI (Llama 3 8B).
    - **Status:** Idle, Working, Locked (waiting on Mutex), Error.

### Module 5.3: The "Calendar for AI" & Scheduling Engine
Agents should be able to run repetitive tasks (e.g., "Review PRs at 9 AM", "Run full test suite on commit").
- **Goal:** Implement a local cron-like scheduling engine.
- **Features:**
  - A visual calendar in the dashboard.
  - Drag and drop tasks onto the timeline.
  - Assign specific models to specific time blocks (e.g., "Run expensive Tier 1 reasoning overnight").

---

## Phase 6: Universal Skills & The Moltbook Adapter

You are not off the rails—the idea of making "Bolt-Ons" portable is exactly where the industry is heading (e.g., Anthropic's MCP - Model Context Protocol).

Currently, our `BoltOnRegistry` requires hardcoded TypeScript classes (`IBoltOn`). We will evolve this into an **Adapter Architecture**.

### Module 6.1: The Universal Registry
The `BoltOnRegistry` will be refactored to accept "Providers".
1. **Native Provider:** Our existing `FileReaderWriterBoltOn` and `UnitTestingBoltOn`.
2. **MCP Provider:** Connects to standard Model Context Protocol servers (allowing our swarm to use ANY tool built for Claude Desktop or Cursor).
3. **Moltbook Interpreter:** A specialized adapter that parses Moltbook declarative skill vocabularies and translates them into executable Node.js actions within our Zero-Trust sandbox.

### Module 6.2: Autonomous Deep Planning (The "Always On" Loop)
To achieve minimal human involvement on massive undertakings:
- The **Antigravity AI** acts as the "Project Manager." It does not write code. It writes *Contracts*.
- The Project Manager sits in an infinite `PollingEngine` loop. It reviews the Git diff, reviews the backlog, and dynamically spawns Headless API workers to tackle the next logical step.
- It uses the "Calendar" to schedule its own future check-ins.