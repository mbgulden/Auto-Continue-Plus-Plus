export interface AgentTaskState {
    /**
     * The unique identifier for the task.
     */
    taskId: string;
    /**
     * The intent or goal of the task, classified by the local AI router.
     */
    intent: string;
    /**
     * The absolute or relative paths of the files relevant to the task.
     */
    relevantFiles: string[];
    /**
     * The specific instructions or context needed by the Bolt-On to execute the task.
     */
    context: Record<string, unknown>;
}

export interface AgentTaskResult {
    /**
     * Indicates whether the Bolt-On considers its execution successful.
     */
    success: boolean;
    /**
     * A message or summary of the execution outcome.
     */
    message: string;
    /**
     * Any data produced by the Bolt-On, such as test results or new file paths.
     */
    outputData?: Record<string, unknown>;
    /**
     * Any error details if the execution failed.
     */
    errorDetails?: string;
}

export interface IBoltOn {
    /**
     * The unique identifier for this Bolt-On.
     */
    id: string;
    /**
     * A description of what this Bolt-On does, used by the router.
     */
    description: string;

    /**
     * Validates that the input state meets the strict pre-conditions required for execution.
     * This prevents "quiet failures" before the agent even begins.
     *
     * @param state The input state to validate.
     * @throws {Error} if the pre-conditions are not met.
     */
    validatePreConditions(state: AgentTaskState): void;

    /**
     * Executes the specific logic of the Bolt-On.
     *
     * @param state The input state for the task.
     * @returns A promise that resolves to the result of the execution.
     */
    execute(state: AgentTaskState): Promise<AgentTaskResult>;

    /**
     * Validates that the execution result meets the strict post-conditions (Hard Contract Enforcement).
     * This ensures the agent didn't just hallucinate success.
     *
     * @param result The result to validate.
     * @throws {Error} if the post-conditions are not met.
     */
    validatePostConditions(result: AgentTaskResult): void;
}
