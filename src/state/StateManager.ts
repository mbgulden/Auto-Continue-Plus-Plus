import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Interface representing the structure of tracked statistics.
 */
export interface AutoContinueStats {
    files: number;
    commands: number;
    recoveries: number;
    handoffs: number;
    lastResetDate: number;

    // Budget Tracking Properties
    budgetCumulativeTokens: number;
    budgetWindowStart: number;
}

/**
 * StateManager handles the persistence of extension state and statistics.
 * It writes statistics to the active workspace folder to ensure multi-environment sync.
 */
export class StateManager {
    private _isActive: boolean = false;
    private readonly _context: vscode.ExtensionContext;
    private readonly STATE_KEY = 'autoContinue.isActive';

    private _onDidChangeStats = new vscode.EventEmitter<AutoContinueStats>();
    public readonly onDidChangeStats = this._onDidChangeStats.event;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
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
     * Checks if the extension is currently active
     */
    public get isActive(): boolean {
        return this._isActive;
    }

    /**
     * Gets the workspace path for the stats JSON file
     * @returns {string | null} Absolute path to the stats file, or null if no workspace.
     */
    private _getWorkspaceDataPath(): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }
        return path.join(workspaceFolders[0].uri.fsPath, '.antigravity', 'autoContinueStats.json');
    }

    /**
     * Initializes stats payload if migrating from older versions
     * Retrieves from workspace storage if available, failing back to globalState
     * @returns {AutoContinueStats} The parsed statistics object.
     */
    private _getInitializedStats(): AutoContinueStats {
        const wsPath = this._getWorkspaceDataPath();
        let stats: any = null;

        if (wsPath && fs.existsSync(wsPath)) {
            try {
                const raw = fs.readFileSync(wsPath, 'utf8');
                stats = JSON.parse(raw);
            } catch (error: any) {
                console.error('[Auto-Continue] Failed to read workspace stats', error);
            }
        }

        if (!stats) {
            stats = this._context.globalState.get('autoContinue.stats', {
                files: 0, commands: 0, recoveries: 0, handoffs: 0, lastResetDate: Date.now(),
                budgetCumulativeTokens: 0, budgetWindowStart: Date.now()
            });
        }

        // Migrations
        if (stats.handoffs === undefined) stats.handoffs = 0;
        if (stats.budgetCumulativeTokens === undefined) stats.budgetCumulativeTokens = 0;
        if (stats.budgetWindowStart === undefined) stats.budgetWindowStart = Date.now();

        // Scrub out legacy lineageMap if migrating
        if (stats.lineageMap !== undefined) delete stats.lineageMap;

        return stats as AutoContinueStats;
    }

    /**
     * Saves the statistics to both the workspace and globalState
     * @param {AutoContinueStats} stats - The stats to save
     */
    private _saveStats(stats: AutoContinueStats): void {
        const wsPath = this._getWorkspaceDataPath();
        if (wsPath) {
            try {
                const dir = path.dirname(wsPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(wsPath, JSON.stringify(stats, null, 2), 'utf8');
            } catch (error: any) {
                console.error('[Auto-Continue] Failed to write workspace stats', error);
            }
        }

        // Always mirror to globalState to maintain backward compatibility and fallback
        this._context.globalState.update('autoContinue.stats', stats);

        this._onDidChangeStats.fire(stats);
    }

    /**
     * Increments the count for a specific stat category
     * @param {'files' | 'commands' | 'recoveries' | 'handoffs'} category
     */
    public incrementStat(category: 'files' | 'commands' | 'recoveries' | 'handoffs'): void {
        const stats = this._getInitializedStats();

        // Reset weekly ROI if more than 7 days passed
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - stats.lastResetDate > SEVEN_DAYS_MS) {
            stats.files = 0;
            stats.commands = 0;
            stats.recoveries = 0;
            stats.handoffs = 0;
            stats.lastResetDate = Date.now();
        }

        stats[category] += 1;
        this._saveStats(stats);
    }

    /**
     * Directly updates the cumulative token budget and manages the window reset logic.
     * This is called continuously by ContextTracker.
     */
    public updateBudgetTokens(addedTokens: number, refreshWindowHours: number): void {
        const stats = this._getInitializedStats();

        const REFRESH_MS = refreshWindowHours * 60 * 60 * 1000;
        const now = Date.now();

        // If we have surpassed the refresh window, reset the tokens and start a new window
        if (now - stats.budgetWindowStart > REFRESH_MS) {
            stats.budgetCumulativeTokens = 0;
            stats.budgetWindowStart = now;
        }

        stats.budgetCumulativeTokens += addedTokens;
        this._saveStats(stats);
    }

    /**
     * Retrieves the current tracking stats
     * @returns {AutoContinueStats} The stats object
     */
    public getStats(): AutoContinueStats {
        return this._getInitializedStats();
    }

    public dispose() {
        this._onDidChangeStats.dispose();
    }
}
