# Chrome DevTools Protocol (CDP) Integration

This document outlines the core strategy for interacting with the Google Antigravity UI using the Chrome DevTools Protocol.

## The Problem with Standard Webviews

As established in [01-Core-Architecture.md](./01-Core-Architecture.md), Antigravity relies heavily on custom Webviews for rendering AI agent interfaces (like the Mission Control dashboard). Standard VS Code extensions cannot query or interact with the Document Object Model (DOM) inside these Webviews using `vscode.commands` or standard node modules.

To bridge this gap, developers must use the **Chrome DevTools Protocol (CDP)**.

## What is CDP?

CDP allows you to directly communicate with the underlying Chromium browser engine that powers Electron-based applications like VS Code and Antigravity. By connecting to the CDP debugging port, you can inspect the DOM, monitor network traffic, and—crucially for our use case—inject and evaluate JavaScript in any context.

## 1. Connecting to the Debugger

The first step is locating the active CDP WebSocket URL for the target Webview. This is done by polling the local debugging endpoint `/json/list`.

```javascript
// Example from auto-accept-agent-antigravity-free
const http = require('http');

function getCdpTargets(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}
```

### Finding the Correct Target
Antigravity (and VS Code) often runs with multiple Webview targets. You must filter the list of targets to find the specific "Agent Panel" or the active auxiliary sidebar.

```javascript
const targets = await getCdpTargets(9000); // Standard CDP Port
// Identify the Antigravity Agent Panel by URL or Title
const agentPanel = targets.find(t =>
    t.url.includes('antigravity.agentPanel') ||
    t.title.includes('Antigravity') ||
    t.url.includes('webview')
);

if (!agentPanel) {
    throw new Error('Agent Panel Webview not found.');
}

const wsUrl = agentPanel.webSocketDebuggerUrl;
```

## 2. Injecting the Payload (`Runtime.evaluate`)

Once you have the `webSocketDebuggerUrl`, you can connect a WebSocket client (like the standard Node `ws` library) and send a `Runtime.evaluate` command to the specific target.

This command executes a JavaScript string *directly inside the context of the Webview*.

```javascript
const WebSocket = require('ws');
const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  const injectionPayload = {
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `
        // The highly resilient DOM selector script goes here
        window.__injectAutoAccept = function() {
           // See 03-DOM-Selectors-and-Webviews.md for details
           console.log("Bolt-On Injected!");
        };
        window.__injectAutoAccept();
      `,
      awaitPromise: true, // Wait for the script to finish
      returnByValue: true // Ensure the result is serialized back
    }
  };

  ws.send(JSON.stringify(injectionPayload));
});

ws.on('message', (data) => {
  const response = JSON.parse(data);
  if (response.id === 1) {
    console.log('Injection successful:', response.result);
    ws.close();
  }
});
```

## 3. Best Practices for CDP Injection

1.  **Port Scanning:** The debugging port (`9000`, `9222`, etc.) can vary. Robust extensions implement a scanning loop to find the active port automatically.
2.  **State Management:** Prevent injecting the script multiple times. In your payload, bind the initialization to a global variable (e.g., `if (window.__isBoltOnActive) return; window.__isBoltOnActive = true;`).
3.  **Error Handling:** Handle WebSocket disconnections gracefully. If the user closes the Webview, the CDP connection will drop. Re-poll `/json/list` when the connection is lost.

---
**Next:** Now that you can execute JavaScript inside the Webview, read [03-DOM-Selectors-and-Webviews.md](./03-DOM-Selectors-and-Webviews.md) to learn how to write a highly resilient payload that finds and clicks the "Accept" buttons.