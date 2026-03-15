# System Architecture Strategy

*Analysis generated based on the architectural constraints of the Google Antigravity ecosystem, the pitfalls of OpenClaw, and the goal of building a robust Swarm Manager.*

## The Open-Source Landscape (GitHub)
The current open-source agent landscape (typified by OpenClaw) is optimizing for **viral reach over secure reliability**. They are building "everything agents" that live loosely in the OS. This results in the "Token Burn" and "Quiet Failure" paradigms documented in our research. 

## Strategic Decision: Piggyback vs. Native Antigravity
**Recommendation: DO NOT piggyback off OpenClaw.**
Attempting to build Auto-Continue Plus Plus on top of OpenClaw inherits its security flaws, lack of strict contracts, and unpredictable routing. 

Instead, **lean heavily into the VS Code / Google Antigravity environment.** 
- **The IDE as a Sandbox:** VS Code provides a natural, bounded context. 
- **Antigravity as the Engine:** You already have access to a powerful, context-aware engine. Auto-Continue Plus Plus should act as the **Swarm Orchestrator** *above* the IDE and Antigravity, seamlessly managing tasks without exposing the raw OS to unbounded LLM agents.

## Architecture: The "Additive Bolt-On" Approach
To build something truly useful and avoid the traps of OpenClaw, the system must be modular, strongly typed, and verifiable.

### 1. The Triple-Headed Hybrid AI Router Engine (Cost & Speed Optimization)
Avoid OpenClaw's mistake of routing everything to expensive models. Implement an "always-on" Swarm Orchestrator that continuously acts as a context filter and task router. The Router commands three distinct "Heads":

1. **The Antigravity Engine (Sidebar Automation):** Treated as built-in structure/knowledge. Tasks sent here are strictly queued by the `ContractManager` to prevent IDE UI bleeding (max 1 active conversation, others queued). Used to leverage Gemini's context for "cheap fuel" and second opinions on complete tasks.
2. **The Headless API Swarm (Parallel Execution):** Direct API calls running entirely in the background. Used for rapid, concurrent parallel execution without touching the VS Code UI.
3. **The Local AI Swarm (The Enforcer):** Fast, free models running on local hardware. Used strictly for routine tasks: intent classification, syntax checking, extracting variables, and "Proof of Work" schema grading.

- **Tier 3 (Local/Always On/Optional Gemini Flash):** Fast, free models running on local AI hardware. Used for routine tasks: intent classification, syntax checking, extracting variables, formatting JSON.
- **Tier 2 (Metered API/Antigravity Gemini 3 Flash/"Smarter" local AI):** Cheap, fast cloud models. Used for basic boilerplate, unit tests, or CRUD endpoints.
- **Tier 1 (Google Antigravity/Jules/Gemini Advanced/Pro Models/High-capacity Local AI):** Expensive, heavy reasoning models. Reserved strictly for complex codebase refactoring, high-level architectural design, and deep debugging.

### 2. Strict Swarm Contracts & "Proof of Work" (Anti-"Quiet Failure")
OpenClaw fails quietly because it trusts the agent's self-assessment. Auto-Continue Plus Plus must implement **Zero-Trust Verification** and a **Qualification Standard** for all agents, especially local hardware.
- Every tool or "bolt-on" must have a strictly typed `pre-condition` and `post-condition`.
- When an agent (e.g., a Tier 3 Local LLM) returns a result for a task, it undergoes "Proof of Work" schema grading.
- If the agent hallucinated or returned malformed output, the `ZeroTrustValidator` instantly fails the Qualification Standard for that task, throwing a loud error. If a lower tier fails repeatedly, the Swarm Manager escalates the task to a smarter, paid Tier 1 model.
- Before the Swarm Manager marks a task as complete, an independent validation step (e.g., running `npm test`, or executing a static analysis check) must occur.

### 3. Modular "Bolt-On" Registry
Instead of OpenClaw's wild API marketplace, create a strictly typed local registry.
- Tools are written as discrete, Full File Edit compatible modules in TypeScript.
- If an agent needs a tool, the Swarm Manager injects the exact TypeScript interface, ensuring the agent only hallucinates within strict bounds.

## How to Make People Actually Use It
1. **Zero Configuration Setup:** Rely on VS Code's extension architecture. It should install and work immediately, unlike OpenClaw's CLI nightmare.
2. **Predictable Pricing:** By routing heavy tasks to Antigravity and using local heuristics for orchestration, the user doesn't burn hundreds of dollars.
3. **Visual Transparency:** Give the user a clear Dashboard to see *exactly* what the Swarm Manager is planning, which agent holds the context, and what the fallback mechanisms are.

## Next Steps for Development
1. Finalize the `Swarm Orchestrator / Global State Manager` designed around hybrid routing.
2. Implement the `Hard Contract Enforcement` pattern to guarantee safety.
3. Build the first highly-specialized "Bolt-on" (e.g., a dedicated Unit Testing Agent) to prove the concept.
