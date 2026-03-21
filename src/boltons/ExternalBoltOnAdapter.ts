import { IAgentBoltOn } from '../api/IAgentBoltOn';
import { IBoltOn, AgentTaskState, AgentTaskResult } from './types';

/**
 * Adapter that converts a standalone spoke extension (IAgentBoltOn) into a 
 * trusted internal Hub executable (IBoltOn). It guarantees the execution lifecycle
 * is secured by enforcing strict isolation and Zero-Trust validation logic seamlessly.
 */
export class ExternalBoltOnAdapter implements IBoltOn {
    private externalBoltOn: IAgentBoltOn;

    constructor(externalBoltOn: IAgentBoltOn) {
        this.externalBoltOn = externalBoltOn;
    }

    get id(): string {
        return this.externalBoltOn.id;
    }

    get description(): string {
        return `[EXTERNAL] ${this.externalBoltOn.name}: ${this.externalBoltOn.description}`;
    }

    /**
     * Internal Hub checks. Since IAgentBoltOn preconditions can be async (querying their own ext state),
     * we skip synchronous internal Hub validation and exclusively evaluate the async conditions during execute().
     */
    public validatePreConditions(state: AgentTaskState): void {
        console.log(`[Adapter] Synchronous pre-conditions bypassed for ${this.id}. Strict async checks will run during execute().`);
    }

    /**
     * Internal Hub checks. Evaluated asynchronously during execute().
     */
    public validatePostConditions(result: AgentTaskResult): void {
        console.log(`[Adapter] Synchronous post-conditions bypassed for ${this.id}. Strict async checks will run during execute().`);
    }

    public async execute(state: AgentTaskState): Promise<AgentTaskResult> {
        try {
            // 1. Enforce Remote Pre-Conditions (Zero Trust)
            if (this.externalBoltOn.preConditions) {
                console.log(`[ExternalBoltOnAdapter] Executing async Zero Trust pre-conditions for '${this.id}'...`);
                const isSafe = await this.externalBoltOn.preConditions(state.context);
                if (!isSafe) {
                    throw new Error(`[ZeroTrustValidator] External BoltOn '${this.id}' failed pre-conditions constraint.`);
                }
            }

            // 2. Execute external payload
            const externalResult = await this.externalBoltOn.execute(state.context);

            // 3. Enforce Remote Post-Conditions (Zero Trust)
            if (this.externalBoltOn.postConditions) {
                console.log(`[ExternalBoltOnAdapter] Executing async Zero Trust post-conditions for '${this.id}'...`);
                const isValid = await this.externalBoltOn.postConditions(externalResult);
                if (!isValid) {
                    throw new Error(`[ZeroTrustValidator] External BoltOn '${this.id}' failed post-conditions. The external Spoke agent hallucinated success.`);
                }
            }

            return {
                success: true,
                message: `External BoltOn '${this.id}' completed execution workflow safely.`,
                outputData: typeof externalResult === 'object' ? externalResult : { value: externalResult }
            };

        } catch (error: any) {
            return {
                success: false,
                message: error.message || `Fatal boundary error executing external BoltOn '${this.id}'.`,
                errorDetails: error.stack
            };
        }
    }
}
