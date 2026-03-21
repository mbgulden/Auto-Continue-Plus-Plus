# Contributing to the Antigravity Orchestration Hub

Welcome to the central nervous system for hybrid-cloud Swarm Orchestration! To prevent chaos and maintain a premium standard, we have established a strict Developer Portal for our community.

## 1. The Manifesto: What Makes a "Good PR"

If you are contributing to the Hub or submitting a new official "Bolt-On" extension, you must adhere to the following rules of engagement:

### Rule 1: Strict Typing
All PRs must pass `npx tsc --noEmit` with zero `any` types in your core logic. Interfaces must be explicitly declared for all incoming/outgoing data payloads.

### Rule 2: The Golden Path
All core architectural patterns must be adhered to. Do not circumvent the routing engine.

### Rule 3: Zero-Trust Validation
Any new Bolt-on that executes terminal commands, accesses the network, or reads/writes the filesystem **must** execute its actions through the `SwarmLockManager` and provide strict pre/post-condition checks that our `ZeroTrustValidator` can evaluate.

### Rule 4: Context Budgets
Every new "Skill", "Tool", or "Agent Personality" must declare its expected token cost and context footprint so the `BudgetManager` can route intelligently and prevent runaway API bills.

---

## 2. The Plugin Interface (API Blueprint)

We will publish the `@antigravity/orchestration-api` npm package containing solely the TypeScript Interfaces. If your PR modifies the core Hub but violates the contract with these interfaces, it will be rejected.

If you are an external VS Code extension developer looking to plug into the Hub, you must register your skill using the public API returned by our `activate` method.

Example implementation for your extension:

```typescript
import * as vscode from 'vscode';
import { IAgentBoltOn, TaskPayload, IBudgetLimiter, TaskResult } from '@antigravity/orchestration-api';

class VertexResearchAgent implements IAgentBoltOn {
    public id = 'vertex-research-agent';
    public type = 'worker';
    public capabilities = ['browser', 'gcp-query'];
    public baseContextCost = 2000;

    public async execute(task: TaskPayload, budget: IBudgetLimiter): Promise<TaskResult> {
        // Your logic here, abiding by the budget.
        return { success: true, message: "Research complete." };
    }
}

export function activate(context: vscode.ExtensionContext) {
    const hubExtension = vscode.extensions.getExtension('mbgulden.antigravity-orchestration-hub');
    if (hubExtension) {
        const api = hubExtension.exports;
        api.registerBoltOn(new VertexResearchAgent());
    }
}
```

Thank you for helping us build the ultimate local-first AI ecosystem!