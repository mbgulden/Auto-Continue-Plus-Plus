import { IBoltOn, AgentTaskState, AgentTaskResult } from '../../boltons/types';
import { IAgentBoltOn, IBudgetLimiter } from '../../api';

/**
 * A dummy budget limiter for Phase 2 implementation.
 * In Phase 3, this will be wired to the real BudgetManager.
 */
class DummyBudgetLimiter implements IBudgetLimiter {
    reserveTokens(tokens: number): boolean { return true; }
    logConsumption(tokens: number): void { }
    enforceContextLimit(): void { }
}

/**
 * An Adapter class that takes an external `IAgentBoltOn` (from the public API)
 * and safely wraps it to conform to the internal `IBoltOn` engine expectations.
 *
 * This prevents runtime crashes when the `ZeroTrustValidator` attempts to call
 * `validatePreConditions` or `validatePostConditions`, which external plugins do not provide.
 */
export class ExternalBoltOnAdapter implements IBoltOn {
    public id: string;
    public description: string;

    private _externalPlugin: IAgentBoltOn;

    constructor(externalPlugin: IAgentBoltOn) {
        this._externalPlugin = externalPlugin;
        this.id = externalPlugin.id;
        // Map capabilities to description so the LLM knows what this tool does
        this.description = `[External Plugin] Type: ${externalPlugin.type}. Capabilities: ${(externalPlugin.capabilities || []).join(', ')}`;
    }

    /**
     * External plugins do not have strict pre-conditions defined.
     * We pass this check automatically, relying on the internal Orchestrator to route correctly.
     */
    public validatePreConditions(state: AgentTaskState): void {
        if (!state) throw new Error(`[ExternalBoltOnAdapter] Null state provided to ${this.id}`);
        // Additional global sandboxing checks for external tools can be inserted here in the future
    }

    /**
     * Executes the external plugin, mapping the internal `AgentTaskState`
     * to the external `TaskPayload` expected by the public API.
     */
    public async execute(state: AgentTaskState): Promise<AgentTaskResult> {
        const payload = {
            taskId: state.taskId,
            intent: state.intent,
            relevantFiles: state.relevantFiles,
            context: state.context
        };

        const budget = new DummyBudgetLimiter();

        try {
            const extResult = await this._externalPlugin.execute(payload, budget);
            return {
                success: extResult.success,
                message: extResult.message,
                outputData: extResult.outputData,
                errorDetails: extResult.errorDetails
            };
        } catch (e: any) {
            return {
                success: false,
                message: `External plugin execution crashed.`,
                errorDetails: e.message
            };
        }
    }

    /**
     * External plugins do not define post-conditions.
     * We do a baseline check to ensure the payload shape is valid.
     */
    public validatePostConditions(result: AgentTaskResult): void {
        if (typeof result.success !== 'boolean') {
             throw new Error(`[ExternalBoltOnAdapter] Post-Condition Failed: External plugin '${this.id}' did not return a valid boolean 'success' flag.`);
        }
    }
}
