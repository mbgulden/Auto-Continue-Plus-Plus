import * as vscode from 'vscode';
import { StateManager } from '../state/StateManager';

export class PollingEngine {
    private _stateManager: StateManager;
    private _intervalId: NodeJS.Timeout | null = null;

    // Default interval in ms
    private _currentInterval: number = 2000;

    // Handlers for specific auto-accept tasks
    private _fileAcceptHandler: () => Promise<void>;
    private _terminalAcceptHandler: () => Promise<void>;

    constructor(
        stateManager: StateManager,
        fileHandler: () => Promise<void>,
        terminalHandler: () => Promise<void>
    ) {
        this._stateManager = stateManager;
        this._fileAcceptHandler = fileHandler;
        this._terminalAcceptHandler = terminalHandler;

        // Listen for configuration changes to polling speed
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('autoContinue.pollingSpeed')) {
                this.updateIntervalSpeed();
            }
        });

        this.updateIntervalSpeed();
    }

    /**
     * Updates polling speed from settings
     */
    private updateIntervalSpeed() {
        const config = vscode.workspace.getConfiguration('autoContinue');
        this._currentInterval = config.get<number>('pollingSpeed', 2000);

        // If currently running, restart with new speed
        if (this._intervalId) {
            this.stop();
            if (this._stateManager.isActive) {
                this.start();
            }
        }
    }

    /**
     * Starts the polling loop
     */
    public start() {
        if (this._intervalId) {
            return; // Already running
        }

        console.log(`[Auto-Continue] Starting polling engine at ${this._currentInterval}ms`);
        this._intervalId = setInterval(async () => {
            // Fast fail if not active
            if (!this._stateManager.isActive) {
                this.stop();
                return;
            }

            await this.runLoop();

        }, this._currentInterval);
    }

    /**
     * Stops the polling loop
     */
    public stop() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
            console.log(`[Auto-Continue] Polling engine stopped.`);
        }
    }

    /**
     * The actual polling logic executed every interval
     */
    private async runLoop() {
        try {
            // 1. Check for pending file diffs / apply
            await this._fileAcceptHandler();

            // 2. Check for pending terminal executions
            await this._terminalAcceptHandler();

        } catch (e) {
            console.error(`[Auto-Continue] Error in polling loop:`, e);
        }
    }
}
