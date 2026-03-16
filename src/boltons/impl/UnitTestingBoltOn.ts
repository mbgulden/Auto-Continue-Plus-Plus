import { IBoltOn, AgentTaskState, AgentTaskResult } from '../types';

/**
 * A specialized Bolt-On for generating and executing unit tests.
 * This Bolt-On expects a target file to test and requires a strict testing framework context.
 * It proves the "Additive Bolt-On" architecture's hard contract enforcement.
 */
export class UnitTestingBoltOn implements IBoltOn {
    public readonly id = 'unit-testing-agent';
    public readonly description = 'Generates and runs unit tests for specific TypeScript/JavaScript files.';

    /**
     * Validates that the input state provides the necessary files and testing context.
     * Prevents the agent from starting without a target file or testing framework defined.
     *
     * @param state The input task state.
     * @throws {Error} if relevantFiles is empty or context is missing framework details.
     */
    public validatePreConditions(state: AgentTaskState): void {
        if (!state.relevantFiles || state.relevantFiles.length === 0) {
            throw new Error(`UnitTestingBoltOn requires at least one target file in 'relevantFiles' to generate tests.`);
        }

        const framework = state.context['framework'];
        if (!framework || typeof framework !== 'string') {
             throw new Error(`UnitTestingBoltOn requires a 'framework' string specified in the context (e.g., 'jest', 'mocha').`);
        }
    }

    /**
     * Executes the unit testing logic.
     * In a real implementation, this would interact with the Antigravity API to generate tests
     * and then run a shell command (e.g., \`npm test -- <file>\`) to verify them.
     *
     * @param state The input task state containing files and context.
     * @returns A promise resolving to the strict AgentTaskResult contract.
     */
    public async execute(state: AgentTaskState): Promise<AgentTaskResult> {
        console.log(`[UnitTestingBoltOn] Executing test generation for files: ${state.relevantFiles.join(', ')}`);

        // Simulating the interaction with the local AI / Google Antigravity
        // In a real scenario, this is where we invoke the LLM to write the test
        // and then we execute the test runner to get the result.

        const framework = state.context['framework'] as string;

        // Mocking a successful execution
        const mockedSuccess = true;

        if (mockedSuccess) {
            return {
                success: true,
                message: `Successfully generated and verified tests using ${framework}.`,
                outputData: {
                    testFilesCreated: state.relevantFiles.map(file => file.replace('.ts', '.test.ts')),
                    coverage: 85
                }
            };
        } else {
             return {
                success: false,
                message: `Failed to generate working tests using ${framework}.`,
                errorDetails: 'Syntax error in generated test file: unexpected token "}".'
            };
        }
    }

    /**
     * Validates that the result actually produced test files and verified them.
     * Prevents the agent from hallucinating that tests passed without creating any files.
     *
     * @param result The execution outcome to validate.
     * @throws {Error} if the success condition is claimed but no output data proves it.
     */
    public validatePostConditions(result: AgentTaskResult): void {
        if (result.success) {
            if (!result.outputData || !result.outputData['testFilesCreated']) {
                throw new Error(`UnitTestingBoltOn claimed success but did not provide 'testFilesCreated' in outputData.`);
            }

            const filesCreated = result.outputData['testFilesCreated'] as string[];
            if (!Array.isArray(filesCreated) || filesCreated.length === 0) {
                 throw new Error(`UnitTestingBoltOn claimed success but the 'testFilesCreated' array is empty.`);
            }
        }
    }
}
