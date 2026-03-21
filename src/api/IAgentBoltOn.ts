export interface IAgentBoltOn {
    /**
     * Unique identifier for the external Bolt-On (e.g., 'your-publisher.your-extension.my-custom-skill')
     */
    id: string;

    /**
     * Display name of the skill
     */
    name: string;

    /**
     * A full description of what the skill does and when the Hub's local LLM router should invoke it.
     */
    description: string;

    /**
     * Version of the skill
     */
    version: string;

    /**
     * Optional pre-condition logic to ensure the execution context is valid before running.
     * Evaluated securely by the Hub's ZeroTrustValidator.
     */
    preConditions?: (context: Record<string, any>) => Promise<boolean>;

    /**
     * The primary execution logic of the external spoke extension.
     */
    execute: (context: Record<string, any>) => Promise<any>;

    /**
     * Optional post-condition logic to ensure the external agent actually achieved its goal.
     * Evaluated securely by the Hub's ZeroTrustValidator to prevent success hallucinations.
     */
    postConditions?: (result: any) => Promise<boolean>;
}

export interface IAntigravityHub {
    /**
     * Registers a custom standalone Spoke extension to the Antigravity Orchestration Hub router.
     * @param boltOn The IAgentBoltOn configuration object.
     */
    registerBoltOn(boltOn: IAgentBoltOn): void;
}
