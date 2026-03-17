# Anti-Stall Defense for VS Code Polling Engines

## The Problem
When running background intervals (`setInterval`) that execute native VS Code commands via `vscode.commands.executeCommand(cmd)`, **NEVER `await` the execution blindly**. 

Many VS Code extension commands (e.g., Python Interpreter selection, Github Copilot logins, or dynamic user prompts) return a `Promise` that **does not resolve until the user interacts with a UI element (QuickPick, Alert, etc)**. 

Awaiting these commands in a background `runLoop` will silently halt the entire interval permanently until the user clicks the UI, breaking background agents and appearing as a "silent stall".

## The Required Machine Process (DO NOT THINK, JUST DO)
Whenever you write code that loops through and fires VS Code commands from an array:
1. **Fire and Forget**: Use `.then()` instead of `await`.
2. **Aggressive Catching**: Handle the Promise rejection inline to prevent unhandled promise exceptions.
3. **Ignore Missing Commands**: VS Code lazily loads extensions. Commands throwing "not found" are normal and must be ignored safely.

**Bad (Will Stall the IDE):**
```typescript
for (const cmd of commandsList) {
    try {
        await vscode.commands.executeCommand(cmd); // STALLS EVERYTHING if a Prompt opens!
    } catch(e) {}
}
```

**Good (The Standard Operation):**
```typescript
for (const cmd of commandsList) {
    vscode.commands.executeCommand(cmd).then(undefined, (e: any) => {
        // Silently ignore "not found", log real errors
        if (e && e.message && !e.message.includes('not found')) {
            console.debug(`[Command Failure] ${cmd}:`, e.message);
        }
    });
}
```

## Proactive Implementation Rules
- If you are building an Auto-Accept feature, **always lean on Chrome DevTools Protocol (CDP) DOM Scrape clicking over Native Commands**.
- If CDP is required, **always explicitly warn the user if it is offline** (e.g., they forgot to launch with `--remote-debugging-port`), instead of failing silently.
