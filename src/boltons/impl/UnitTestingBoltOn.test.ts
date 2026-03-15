import * as assert from 'assert';
import { UnitTestingBoltOn } from './UnitTestingBoltOn';
import { AgentTaskState, AgentTaskResult } from '../types';

describe('UnitTestingBoltOn Test Suite', () => {
    let boltOn: UnitTestingBoltOn;

    beforeEach(() => {
        boltOn = new UnitTestingBoltOn();
    });

    describe('validatePreConditions', () => {
        it('should throw if no relevantFiles are provided', () => {
            const state: AgentTaskState = { taskId: '1', intent: 'test', relevantFiles: [], context: { framework: 'jest' } };
            assert.throws(
                () => boltOn.validatePreConditions(state),
                /UnitTestingBoltOn requires at least one target file in 'relevantFiles'/
            );
        });

        it('should throw if framework is missing from context', () => {
            const state: AgentTaskState = { taskId: '1', intent: 'test', relevantFiles: ['src/index.ts'], context: {} };
            assert.throws(
                () => boltOn.validatePreConditions(state),
                /UnitTestingBoltOn requires a 'framework' string specified in the context/
            );
        });

        it('should pass with valid state', () => {
            const state: AgentTaskState = { taskId: '1', intent: 'test', relevantFiles: ['src/index.ts'], context: { framework: 'jest' } };
            assert.doesNotThrow(() => boltOn.validatePreConditions(state));
        });
    });

    describe('execute', () => {
        it('should return a successful mock execution result', async () => {
            const state: AgentTaskState = { taskId: '1', intent: 'test', relevantFiles: ['src/index.ts'], context: { framework: 'jest' } };
            const result = await boltOn.execute(state);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.message, 'Successfully generated and verified tests using jest.');
            assert.ok(result.outputData);
            assert.deepStrictEqual(result.outputData.testFilesCreated, ['src/index.test.ts']);
        });
    });

    describe('validatePostConditions', () => {
        it('should pass a successful result that created test files', () => {
            const result: AgentTaskResult = {
                success: true,
                message: 'Done',
                outputData: { testFilesCreated: ['src/index.test.ts'] }
            };
            assert.doesNotThrow(() => boltOn.validatePostConditions(result));
        });

        it('should throw if success claimed without outputData', () => {
            const result: AgentTaskResult = { success: true, message: 'Done' };
            assert.throws(
                () => boltOn.validatePostConditions(result),
                /UnitTestingBoltOn claimed success but did not provide 'testFilesCreated' in outputData/
            );
        });

        it('should throw if success claimed with an empty testFilesCreated array', () => {
            const result: AgentTaskResult = { success: true, message: 'Done', outputData: { testFilesCreated: [] } };
            assert.throws(
                () => boltOn.validatePostConditions(result),
                /UnitTestingBoltOn claimed success but the 'testFilesCreated' array is empty/
            );
        });

        it('should pass a failure result without output validation', () => {
            const result: AgentTaskResult = {
                success: false,
                message: 'Failed to generate',
                errorDetails: 'Syntax error'
            };
            assert.doesNotThrow(() => boltOn.validatePostConditions(result));
        });
    });
});
