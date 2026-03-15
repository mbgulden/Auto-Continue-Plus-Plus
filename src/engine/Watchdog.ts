import * as vscode from 'vscode';
import { StateManager } from '../state/StateManager';

export class Watchdog {
    private _stateManager: StateManager;
    private _lastActivityTime: number = Date.now();
    private _recoveryTimeoutSeconds: number = 60; // Default 60s
    private _watchdogIntervalId: NodeJS.Timeout | null = null;
    private _recoveryProtocol: () => Promise<void>;

    constructor(stateManager: StateManager, recoveryProtocol: () => Promise<void>) {
        this._stateManager = stateManager;
        this._recoveryProtocol = recoveryProtocol;

        // Load config
        const config = vscode.workspace.getConfiguration('autoContinue');
        this._recoveryTimeoutSeconds = config.get<number>('watchdogTimeoutSeconds', 60);

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('autoContinue.watchdogTimeoutSeconds')) {
                this._recoveryTimeoutSeconds = vscode.workspace.getConfiguration('autoContinue').get<number>('watchdogTimeoutSeconds', 60);
            }
        });

        // Start tracking if active
        if (this._stateManager.isActive) {
            this.start();
        }
    }

    /**
     * Resets the inactivity timer. Should be called by PollingEngine whenever
     * an action is taken or the agent writes to terminal/files.
     */
    public ping() {
        this._lastActivityTime = Date.now();
        // console.log('[Watchdog] Activity pinged.');
    }

    public start() {
        if (this._watchdogIntervalId) return;

        this.ping(); // Reset on start

        // Check every 5 seconds if the timeout has been breached
        this._watchdogIntervalId = setInterval(() => {
            if (!this._stateManager.isActive || this._recoveryTimeoutSeconds <= 0) {
                // If it becomes disabled, just do nothing and wait for changes.
                // Or we can stop it, but config changes might reactivate it without a start.
                return;
            }

            const elapsedSeconds = (Date.now() - this._lastActivityTime) / 1000;

            if (elapsedSeconds > this._recoveryTimeoutSeconds) {
                console.warn(`[Watchdog] ⚠️ Agent has been inactive for ${Math.round(elapsedSeconds)}s. Initiating recovery protocol!`);
                this._recoveryProtocol();
                this.ping(); // Give it time to recover before triggering again
            }
        }, 5000);
    }

    public stop() {
        if (this._watchdogIntervalId) {
            clearInterval(this._watchdogIntervalId);
            this._watchdogIntervalId = null;
        }
    }
}
