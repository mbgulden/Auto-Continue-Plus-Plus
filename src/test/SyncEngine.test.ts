import * as assert from 'assert';
import * as vscode from 'vscode';
import { SyncEngine } from '../engine/SyncEngine';

suite('SyncEngine Test Suite', () => {
    test('SyncEngine exports correctly', () => {
        const mockContext = {
            globalState: {
                get: (key: string, defaultValue?: any) => defaultValue,
                update: (key: string, value: any) => Promise.resolve()
            }
        } as unknown as vscode.ExtensionContext;

        const engine = new SyncEngine(mockContext);
        assert.ok(engine !== undefined, 'SyncEngine should instantiate without errors');
        assert.ok(typeof engine.runContinuousSync === 'function', 'runContinuousSync should be a function');
    });
});
