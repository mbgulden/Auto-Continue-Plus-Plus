# Advanced Features for Autonomous Agent Automations

This document covers best practices and "amazing features" discovered in the top Antigravity auto-accept extensions. These features elevate a basic "auto-clicker" into a robust, observable, and safe "Hybrid Swarm Router."

## 1. Visual Debugging Overlay (The "Status Badge")

When running an extension like `Auto-Continue-Plus-Plus` that injects CDP scripts into isolated Webviews, the human user (or a headless monitoring agent) has no easy way to know if the script is active or failing.

**Solution:** The injected CDP script should physically mount a CSS overlay (a small floating badge) inside the Webview itself.

### Implementation

```javascript
// Inside your injected CDP payload (Runtime.evaluate):
const OVERLAY_ID = '__autoAcceptFreeOverlay';

function mountOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: #00ff00;
        padding: 5px 10px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 11px;
        z-index: 999999;
        pointer-events: none; /* Crucial: Do not block clicks! */
        transition: opacity 0.3s;
    `;

    // Status can be updated dynamically
    overlay.textContent = '🟢 Auto-Accept: ACTIVE (Clicks: 0)';
    document.body.appendChild(overlay);
}

function updateOverlayStatus(message) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
        overlay.textContent = message;
    }
}
```

## 2. The Circuit Breaker (Infinite Loop Protection)

AI agents (like Gemini 3 in Antigravity) can sometimes get stuck in an infinite error loop:
1. AI proposes a bad terminal command.
2. Auto-Accept clicks "Run".
3. The command fails immediately.
4. AI apologizes and proposes the exact same bad command.
5. Loop repeats indefinitely, burning API tokens.

**Solution:** Implement a Circuit Breaker inside the CDP script that tracks the timestamps of recent clicks. If too many clicks happen in a short time window, it trips the breaker and stops clicking.

### Implementation

```javascript
// Track timestamps of the last N clicks in a global array
window.__AA_RECOVERY_TS = window.__AA_RECOVERY_TS || [];

function checkCircuitBreaker() {
    const now = Date.now();

    // Keep only timestamps from the last 10 seconds
    window.__AA_RECOVERY_TS = window.__AA_RECOVERY_TS.filter(ts => now - ts < 10000);

    // If more than 5 clicks happened in 10 seconds, trip the breaker!
    if (window.__AA_RECOVERY_TS.length >= 5) {
        console.warn("CIRCUIT BREAKER TRIPPED! Infinite loop detected.");
        updateOverlayStatus('🔴 Auto-Accept: PAUSED (Circuit Breaker)');
        return true; // Breaker is OPEN (do not click)
    }

    return false; // Breaker is CLOSED (safe to click)
}

function recordClick() {
    window.__AA_RECOVERY_TS.push(Date.now());
    // ... perform click ...
}
```

## 3. Banned Command Protection (Safety)

Before blindly clicking "Accept" on a terminal command proposed by an AI agent, the CDP script must verify the command is safe.

In `Auto-Continue-Plus-Plus`, you have a `BanList.ts`. The contents of this banlist should be passed into the CDP payload so the script can read the DOM *around* the button, extract the proposed terminal text, and block the click if it matches a banned pattern (e.g., `rm -rf`).

### Implementation

```javascript
// Pass the banlist array into the payload
const bannedCommands = ['rm -rf', 'format', 'shutdown'];

function isCommandBanned(buttonElement) {
    // 1. Find the container/parent holding the proposed command
    // (This selector depends heavily on the specific Webview structure)
    const commandContainer = buttonElement.closest('.terminal-proposal-container');

    if (!commandContainer) return false; // Cannot find text, assume safe or handle differently

    // 2. Extract the text
    const proposedText = commandContainer.textContent.toLowerCase();

    // 3. Check against the banlist
    for (const banned of bannedCommands) {
        if (proposedText.includes(banned)) {
            console.error(`Blocked banned command: ${banned}`);
            updateOverlayStatus(`⚠️ Blocked: ${banned}`);
            return true;
        }
    }

    return false; // Command is safe
}

// Usage inside the click polling loop:
if (!checkCircuitBreaker() && !isCommandBanned(targetButton)) {
    recordClick();
    simulateResilientClick(targetButton);
}
```

## 4. Process Detection / Auto-Wakeup

To save CPU cycles, the extension shouldn't aggressively poll `/json/list` or run `setInterval` loops inside Webviews if the user has minimized or closed the Antigravity IDE.

Advanced extensions monitor OS-level processes or use `document.visibilityState` to pause the auto-accept engine when the IDE is inactive, and instantly wake it up when focus returns.

### Implementation (Webview Side)

```javascript
// Pause the polling loop if the Webview is hidden
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        console.log("Webview hidden. Pausing auto-accept.");
        window.__pauseAutoAccept = true;
    } else {
        console.log("Webview visible. Resuming auto-accept.");
        window.__pauseAutoAccept = false;
    }
});
```

---
*End of Encyclopedia.*