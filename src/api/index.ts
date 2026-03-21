/**
 * @antigravity/orchestration-api
 * This file serves as the blueprint for the public API package that external
 * extensions (Spokes) will use to interface with the Antigravity Orchestration Hub.
 */

export interface TaskPayload {
    taskId: string;
    intent: string;
    relevantFiles: string[];
    context: Record<string, unknown>;
}

export interface TaskResult {
    success: boolean;
    message: string;
    outputData?: Record<string, unknown>;
    errorDetails?: string;
    tokensConsumed?: number;
}

export interface IBudgetLimiter {
    /**
     * Attempts to reserve tokens before execution to prevent runaway API bills.
     * @param tokens The number of estimated tokens to reserve.
     * @returns True if the budget permits the request, false otherwise.
     */
    reserveTokens(tokens: number): boolean;

    /**
     * Logs actual tokens consumed after execution.
     * @param tokens The actual number of tokens consumed.
     */
    logConsumption(tokens: number): void;

    /**
     * Throws an error if the global maximum context window has been breached.
     */
    enforceContextLimit(): void;
}

/**
 * The standard interface all external plugins MUST implement to register a "Skill"
 * or "Agent Personality" with the Antigravity Orchestration Hub.
 */
export interface IAgentBoltOn {
    id: string; // e.g., 'vertex-research-agent'
    type: 'worker' | 'sub-manager' | 'tool';
    capabilities: string[]; // e.g., ['browser', 'fs-read', 'python-runtime']
    baseContextCost: number; // e.g., 2000 tokens

    /**
     * Executes the specific logic of the Bolt-On.
     * The `ZeroTrustValidator` will automatically wrap this execution to verify safety.
     *
     * @param task The payload from the Orchestrator.
     * @param budget The injected limiter to strictly track token/context costs.
     * @returns A promise that resolves to the result of the execution.
     */
    execute(task: TaskPayload, budget: IBudgetLimiter): Promise<TaskResult>;
}
