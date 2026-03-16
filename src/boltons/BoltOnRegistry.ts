import { IBoltOn } from './types';

/**
 * A central registry to manage and retrieve specialized Bolt-Ons.
 * The Swarm Manager uses this to find the right tool for an intent.
 */
export class BoltOnRegistry {
    private readonly boltOns: Map<string, IBoltOn> = new Map();

    /**
     * Registers a new Bolt-On with the system.
     * Throws an error if a Bolt-On with the same ID already exists to prevent silent overwrites.
     *
     * @param boltOn The Bolt-On instance to register.
     * @throws {Error} if a Bolt-On with the same ID is already registered.
     */
    public register(boltOn: IBoltOn): void {
        if (this.boltOns.has(boltOn.id)) {
            throw new Error(`[BoltOnRegistry] Cannot register Bolt-On: A Bolt-On with ID '${boltOn.id}' is already registered.`);
        }
        this.boltOns.set(boltOn.id, boltOn);
        console.log(`[BoltOnRegistry] Successfully registered Bolt-On: ${boltOn.id}`);
    }

    /**
     * Retrieves a registered Bolt-On by its ID.
     * Throws a loud error if the Bolt-On is not found to enforce strict routing constraints.
     *
     * @param id The unique identifier of the Bolt-On.
     * @returns The requested Bolt-On instance.
     * @throws {Error} if no Bolt-On is found with the given ID.
     */
    public get(id: string): IBoltOn {
        const boltOn = this.boltOns.get(id);
        if (!boltOn) {
            throw new Error(`[BoltOnRegistry] Failed to retrieve Bolt-On: No Bolt-On registered with ID '${id}'.`);
        }
        return boltOn;
    }

    /**
     * Returns a list of all currently registered Bolt-Ons.
     * Useful for the router when it needs to inspect available tools.
     *
     * @returns An array of registered Bolt-On instances.
     */
    public getAll(): IBoltOn[] {
        return Array.from(this.boltOns.values());
    }

    /**
     * Clears all registered Bolt-Ons. Primarily useful for testing.
     */
    public clear(): void {
        this.boltOns.clear();
        console.log('[BoltOnRegistry] Cleared all registered Bolt-Ons.');
    }
}
