# CDP & Auto-Accept Audit Findings (Tailored for Auto-Continue Plus Plus)

## Objective
Audit 12 open-source VS Code extensions related to "Antigravity" and "Auto-Accept" to determine the most robust, future-proof methods for clicking the "Run" button inside Webviews via the Chrome DevTools Protocol (CDP), and identify features useful for a multi-agent swarm architecture.

This document is specifically tailored to the `mbgulden/Auto-Continue-Plus-Plus` codebase.

---

## 1. The Core Failure: Why is `Auto-Continue-Plus-Plus` failing in certain contexts?

Currently, `src/extension.ts` relies on IPC command execution:
```typescript
await vscode.commands.executeCommand('antigravity.acceptTask');
```
While this is the safest and cleanest approach, it often fails in modern Antigravity environments because:
1. **Dynamic UI:** AI agents (like Gemini 3 models in Antigravity) render custom Webviews (`<iframe>` or `<webview>` tags) for mission control and task diffing. The "Accept" buttons in these webviews do not always map 1:1 to a globally registered `vscode.commands`.
2. **Context Isolation:** Webviews run in their own isolated DOM context. Standard `vscode.commands` cannot blindly reach inside a webview and trigger a DOM-bound event listener attached to a specific button instance.

To solve this, a **"Bolt-On" CDP Scraper** must be integrated alongside your current `PollingEngine`.

---

## 2. CDP Integration: The Winning Strategy from the Audit

Based on the audit of repos like `antigravity-autorun` and `auto-accept-agent-antigravity-free`, here is exactly how CDP is used to bypass the isolation:

### A. Polling for the Target Webview
You must poll `http://127.0.0.1:<PORT>/json/list` (usually port `9000` or `9222`) to find the exact `webSocketDebuggerUrl` of the Antigravity Agent Panel.

```javascript
// Example from antigravity-auto-accept
const response = await fetch('http://127.0.0.1:9000/json/list');
const targets = await response.json();
const agentPanel = targets.find(t => t.url.includes('antigravity.agentPanel') || t.title.includes('Antigravity'));
const wsUrl = agentPanel.webSocketDebuggerUrl;
```

### B. Injecting the Payload via `Runtime.evaluate`
Once connected to the websocket, send a CDP command to evaluate JavaScript *directly inside the Webview's context*:

```json
{
  "id": 1,
  "method": "Runtime.evaluate",
  "params": {
    "expression": "window.__injectAutoAccept()",
    "awaitPromise": true
  }
}
```

---

## 3. DOM Selectors & Event Dispatching (The Payload)

Inside the injected script, standard `.click()` calls fail due to Shadow DOMs, transparent overlays, and complex web components (like `<vscode-button>`).

### Robust Selectors
**Do not use:** `document.querySelectorAll('button')`
**Use this (from `antigravity-autorun`):**
```javascript
const selectors = [
    'button',
    'vscode-button',
    '[role="button"]',
    '.monaco-button',
    '.monaco-text-button'
].join(', ');

const candidates = document.querySelectorAll(selectors);
```

### Bypassing Overlays with PointerEvents
VS Code heavily relies on transparent overlays to capture scroll events or block input during processing. The audited extensions use `document.elementFromPoint(cx, cy)` to detect blocking layers.

**The Ultimate Click Sequence:**
```javascript
// 1. Temporarily disable pointer events on the blocking overlay
blockingOverlay.style.pointerEvents = 'none';

// 2. Dispatch a full suite of PointerEvents to simulate a real human click
const opts = { bubbles: true, cancelable: true, view: window };
button.dispatchEvent(new PointerEvent('pointerdown', opts));
button.dispatchEvent(new MouseEvent('mousedown', opts));
button.dispatchEvent(new PointerEvent('pointerup', opts));
button.dispatchEvent(new MouseEvent('mouseup', opts));

// 3. Fire standard click and keyboard fallback
button.click();
button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));

// 4. Restore the overlay
blockingOverlay.style.pointerEvents = 'originalValue';
```

---

## 4. Standout / "Amazing" Features Discovered

These features were found across the audited repositories and should be prioritized for future sprints in `Auto-Continue-Plus-Plus`:

### 1. Visual Debugging Overlay (`antigravity-auto-accept`)
Injects a physical CSS DOM element (a small floating badge) inside the Webview to show the status: `🟢 Auto-Accept: ACTIVE (Clicked: 5)`.
* **Why it matters:** Crucial for headless/swarm setups to visually verify the script is running without needing to read terminal logs.

### 2. The Circuit Breaker (`antigravity-plus` & `AntiGravity-AutoAccept`)
If an AI agent falls into an infinite error loop (e.g., proposing a bad command, auto-accept clicks it, it fails, AI proposes it again), the circuit breaker trips.
* **Implementation:** Tracks timestamps of recent clicks in `window.__AA_RECOVERY_TS`. If > 5 clicks happen in 10 seconds, it returns `blocked:circuit_breaker` and pauses execution.
* **Why it matters:** Prevents burning through API tokens and system resources.

### 3. Banned Command Protection (`antigravity-auto-accept`)
Parses the DOM *around* the proposed button to read the actual terminal command text. If the command matches a configurable blocklist (e.g., `['rm -rf', 'format']`), the script actively skips the click.
* **Integration for you:** This perfectly complements your `BanList` in `src/security/BanList.ts`. The injected CDP script can read the DOM text and cross-reference it with your blocklist.

### 4. Process Detection / Auto-Wakeup (`antigravity-plus`)
Monitors OS-level processes to detect if VS Code/Cursor is actually running. If the IDE is closed, it pauses the aggressive CDP polling.

---

## 5. Recommendation for `Auto-Continue-Plus-Plus`

To evolve `Auto-Continue-Plus-Plus` into a true Hybrid Swarm Router:
1. **Keep `PollingEngine.ts`:** Maintain the current command-based approach as the first line of defense (it is safer and faster when it works).
2. **Build a `CdpBoltOn` Class:** Implement a new capability (`IBoltOn`) that runs alongside `PollingEngine.ts`. When `PollingEngine` detects no known commands are available, the `CdpBoltOn` steps in, uses CDP to inject the robust DOM selector script with PointerEvents, and visually confirms the click using an injected overlay.
3. **Migrate `BanList` into the Webview:** Pass your `BanList` array into the CDP payload so the injected script can read the DOM terminal text and block dangerous commands locally.
