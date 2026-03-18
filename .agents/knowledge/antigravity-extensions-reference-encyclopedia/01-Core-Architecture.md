# Core Architecture of Google Antigravity

This document outlines the foundational architecture of Google Antigravity and how it differs from a standard Visual Studio Code (VS Code) environment. Understanding these differences is crucial for developing robust extensions and automated agents.

## What is Google Antigravity?

Google Antigravity is an AI-powered development platform and IDE released in late 2025. It is built as a heavily modified fork of Visual Studio Code. Its primary purpose is to serve as a host environment for autonomous AI agents (powered by Gemini 3 and third-party models) to plan, execute, and verify software tasks across the editor, terminal, and browser.

## The Dual Interface

Antigravity introduces a paradigm shift by splitting the IDE experience into two main surfaces:

1.  **Agent Manager (Mission Control):**
    *   A high-level management dashboard, often rendered as a complex Webview.
    *   Allows human overseers to monitor multiple autonomous agents working in parallel across different workspaces.
    *   This is where "auto-accept" and swarm routing logic typically needs to intervene.

2.  **Editor View:**
    *   The traditional IDE environment for coding tasks.
    *   Maintains compatibility with standard VS Code extensions, themes, and APIs (`vscode.*`).
    *   Features deep AI integration, including inline tab completions and intelligent terminal commands.

## Why Standard VS Code Automation Fails

In standard VS Code extension development, automating tasks is typically done via the Extension API:

```typescript
// The standard, safe way
await vscode.commands.executeCommand('extension.acceptAction');
```

However, in Antigravity, the AI agents heavily utilize custom, isolated **Webviews** to present diffs, propose terminal commands, and request user confirmation (the "Accept" or "Run" buttons).

These Webviews:
*   Run in isolated DOM contexts (often `<iframe>` or `<webview>` tags).
*   Do not reliably expose their internal buttons to the global `vscode.commands` registry.
*   Are dynamically generated and frequently updated, making static CSS scraping brittle.

## The "Bolt-On" Hybrid Approach

Because standard IPC commands (`vscode.commands`) cannot reliably reach inside the Antigravity Agent Webviews, developers must use a **Hybrid Swarm Router** architecture.

This architecture combines:
1.  **The Standard API (Primary):** Attempting to execute known commands (e.g., `antigravity.acceptTask`).
2.  **The CDP Bolt-On (Fallback):** If the command is unavailable, the extension connects to the underlying Chromium browser via the Chrome DevTools Protocol (CDP), locates the specific Webview target, and injects a highly resilient JavaScript payload to physically simulate a user click on the "Accept" button.

This dual-layered approach is the core philosophy behind successful Antigravity automation tools like `Auto-Continue-Plus-Plus`.

---
**Next:** Read [02-CDP-Integration.md](./02-CDP-Integration.md) to understand how to build the CDP Bolt-On fallback mechanism.