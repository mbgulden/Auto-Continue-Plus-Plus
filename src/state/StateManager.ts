import * as vscode from 'vscode';

export class StateManager {
    private _isActive: boolean = false;
    private readonly _context: vscode.ExtensionContext;
    private readonly STATE_KEY = 'autoContinue.isActive';

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        // Load persisted state if necessary, default to false for safety
        this._isActive = this._context.globalState.get<boolean>(this.STATE_KEY, false);
    }

    /**
     * Toggles the active state of the auto-continue agent
     */
    public toggleActive(): void {
        this._isActive = !this._isActive;
        this._context.globalState.update(this.STATE_KEY, this._isActive);

        if (this._isActive) {
            vscode.window.showInformationMessage('Auto-Continue: ENABLED');
        } else {
            vscode.window.showInformationMessage('Auto-Continue: PAUSED');
        }
    }

    /**
     * Returns whether the auto-continue agent is active
     */
    public get isActive(): boolean {
        return this._isActive;
    }

    /**
     * Increments the count for a specific stat category
     * @param category 'files' | 'commands' | 'recoveries'
     */
    public incrementStat(category: 'files' | 'commands' | 'recoveries'): void {
        const stats: any = this._context.globalState.get('autoContinue.stats', {
            files: 0, commands: 0, recoveries: 0, lastResetDate: Date.now()
        });

        // Reset weekly if more than 7 days passed
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - stats.lastResetDate > SEVEN_DAYS_MS) {
            stats.files = 0;
            stats.commands = 0;
            stats.recoveries = 0;
            stats.lastResetDate = Date.now();
        }

        stats[category] += 1;
        this._context.globalState.update('autoContinue.stats', stats);
    }

    /**
     * Gets the current stats payload to display in the UI
     */
    public getStats(): any {
        return this._context.globalState.get('autoContinue.stats', {
            files: 0, commands: 0, recoveries: 0, lastResetDate: Date.now()
        });
    }
}
