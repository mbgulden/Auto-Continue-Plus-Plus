import * as vscode from 'vscode';

/**
 * Caches the list of available VS Code commands to avoid expensive repeated calls.
 * This is particularly useful for polling loops that need to check for the presence of specific commands.
 */
export class CommandCache {
    private _cachedCommands: string[] | null = null;
    private _lastFetchTime: number = 0;
    private _pendingPromise: Promise<string[]> | null = null;
    private readonly _ttl: number;

    /**
     * @param ttl The time-to-live for the cache in milliseconds. Defaults to 60 seconds.
     */
    constructor(ttl: number = 60000) {
        this._ttl = ttl;
    }

    /**
     * Retrieves the list of available commands, either from the cache or by fetching them from VS Code.
     * @returns A promise that resolves to an array of command identifiers.
     */
    public async getCommands(): Promise<string[]> {
        const now = Date.now();
        if (this._cachedCommands && (now - this._lastFetchTime < this._ttl)) {
            return this._cachedCommands;
        }

        if (this._pendingPromise) {
            return this._pendingPromise;
        }

        this._pendingPromise = (async () => {
            try {
                this._cachedCommands = await vscode.commands.getCommands(true);
                this._lastFetchTime = now;
                return this._cachedCommands;
            } catch (error) {
                console.error('[Auto-Continue] Error fetching commands for cache:', error);
                // If fetching fails, return previous cache if available, or empty array
                return this._cachedCommands || [];
            } finally {
                this._pendingPromise = null;
            }
        })();

        return this._pendingPromise;
    }

    /**
     * Manually invalidates the cache, forcing the next call to `getCommands` to fetch fresh data.
     */
    public invalidate(): void {
        this._cachedCommands = null;
        this._lastFetchTime = 0;
    }
}
