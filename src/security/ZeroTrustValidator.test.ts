import * as assert from 'assert';
import { ZeroTrustValidator } from './ZeroTrustValidator';
import { IBoltOn, AgentTaskState, AgentTaskResult } from '../boltons/types';

class MockBoltOn implements IBoltOn {
    id = 'mock-agent';
    description = 'Mock for testing validator';

    validatePreConditions(state: AgentTaskState): void {
        if (!state.context['token']) {
            throw new Error('Missing token in pre-condition check');
        }
    }

    async execute(state: AgentTaskState): Promise<AgentTaskResult> {
        return { success: true, message: 'Executed' };
    }

    validatePostConditions(result: AgentTaskResult): void {
        if (result.success && !result.outputData) {
            throw new Error('Success without output data');
        }
    }
}

describe('ZeroTrustValidator Test Suite', () => {
    let validator: ZeroTrustValidator;
    let boltOn: MockBoltOn;

    beforeEach(() => {
        validator = new ZeroTrustValidator();
        boltOn = new MockBoltOn();
    });

    describe('validateExecutionStart', () => {
        it('should throw a loud error for null state', () => {
            assert.throws(
                () => validator.validateExecutionStart(boltOn, null as any),
                /Critical Error: Received null or undefined state/
            );
        });

        it('should throw a loud error for empty task ID', () => {
            const state: AgentTaskState = { taskId: '', intent: 'test', relevantFiles: [], context: {} };
            assert.throws(
                () => validator.validateExecutionStart(boltOn, state),
                /Critical Error: Task state for Bolt-On 'mock-agent' is missing a valid 'taskId'/
            );
        });

        it('should bubble up Bolt-On pre-condition failure as loud error', () => {
            const state: AgentTaskState = { taskId: 'task-1', intent: 'test', relevantFiles: [], context: {} };
            assert.throws(
                () => validator.validateExecutionStart(boltOn, state),
                /Pre-condition failure for Bolt-On 'mock-agent' on Task 'task-1'. Details: Missing token in pre-condition check/
            );
        });

        it('should pass valid state', () => {
            const state: AgentTaskState = { taskId: 'task-1', intent: 'test', relevantFiles: [], context: { token: 'valid' } };
            assert.doesNotThrow(() => validator.validateExecutionStart(boltOn, state));
        });
    });

    describe('validateExecutionEnd', () => {
        it('should throw a loud error for null result', () => {
            assert.throws(
                () => validator.validateExecutionEnd(boltOn, null as any),
                /Critical Error: Bolt-On 'mock-agent' returned a null or undefined result/
            );
        });

        it('should throw a loud error for logic failure (success + errorDetails)', () => {
            const result: AgentTaskResult = { success: true, message: 'Done', errorDetails: 'Wait, an error?' };
            assert.throws(
                () => validator.validateExecutionEnd(boltOn, result),
                /Logic Error: Bolt-On 'mock-agent' returned success=true but included errorDetails/
            );
        });

        it('should throw a loud error for logic failure (failure without errorDetails)', () => {
            const result: AgentTaskResult = { success: false, message: 'Failed' };
            assert.throws(
                () => validator.validateExecutionEnd(boltOn, result),
                /Logic Error: Bolt-On 'mock-agent' returned success=false but did not provide errorDetails/
            );
        });

        it('should bubble up Bolt-On post-condition failure as loud error', () => {
            const result: AgentTaskResult = { success: true, message: 'Done', outputData: undefined };
            assert.throws(
                () => validator.validateExecutionEnd(boltOn, result),
                /Post-condition failure for Bolt-On 'mock-agent'. The agent likely hallucinated success or failed to fulfill the contract. Details: Success without output data/
            );
        });

        it('should pass valid successful result', () => {
            const result: AgentTaskResult = { success: true, message: 'Done', outputData: { someData: 1 } };
            assert.doesNotThrow(() => validator.validateExecutionEnd(boltOn, result));
        });

        it('should pass valid failure result', () => {
            const result: AgentTaskResult = { success: false, message: 'Failed properly', errorDetails: 'API timeout' };
            assert.doesNotThrow(() => validator.validateExecutionEnd(boltOn, result));
        });
    });
});
