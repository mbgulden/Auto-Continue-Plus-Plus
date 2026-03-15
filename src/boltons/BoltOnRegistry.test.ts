import * as assert from 'assert';
import { BoltOnRegistry } from './BoltOnRegistry';
import { IBoltOn, AgentTaskState, AgentTaskResult } from './types';

class MockBoltOn implements IBoltOn {
    public id: string;
    constructor(id: string) {
        this.id = id;
    }
    description = 'Mock description';
    validatePreConditions(state: AgentTaskState): void {}
    async execute(state: AgentTaskState): Promise<AgentTaskResult> {
        return { success: true, message: 'mock' };
    }
    validatePostConditions(result: AgentTaskResult): void {}
}

describe('BoltOnRegistry Test Suite', () => {
    let registry: BoltOnRegistry;

    beforeEach(() => {
        registry = new BoltOnRegistry();
    });

    it('should register and retrieve a Bolt-On', () => {
        const mock = new MockBoltOn('test-agent');
        registry.register(mock);

        const retrieved = registry.get('test-agent');
        assert.strictEqual(retrieved.id, 'test-agent');
    });

    it('should throw a loud error when retrieving a non-existent Bolt-On', () => {
        assert.throws(
            () => registry.get('non-existent'),
            /Failed to retrieve Bolt-On: No Bolt-On registered with ID 'non-existent'/
        );
    });

    it('should throw a loud error when registering duplicate IDs', () => {
        const mock1 = new MockBoltOn('test-agent');
        const mock2 = new MockBoltOn('test-agent');

        registry.register(mock1);

        assert.throws(
            () => registry.register(mock2),
            /Cannot register Bolt-On: A Bolt-On with ID 'test-agent' is already registered/
        );
    });

    it('should return all registered Bolt-Ons', () => {
        registry.register(new MockBoltOn('agent-1'));
        registry.register(new MockBoltOn('agent-2'));

        const all = registry.getAll();
        assert.strictEqual(all.length, 2);
    });

    it('should clear all registered Bolt-Ons', () => {
        registry.register(new MockBoltOn('agent-1'));
        registry.clear();

        assert.strictEqual(registry.getAll().length, 0);
    });
});
