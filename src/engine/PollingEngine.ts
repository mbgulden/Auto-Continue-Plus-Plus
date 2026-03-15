import * as vscode from 'vscode';
import { StateManager } from '../state/StateManager';
import { CDPHandler } from './CDPHandler';

export class PollingEngine {
    private _stateManager: StateManager;
    private _intervalId: NodeJS.Timeout | null = null;
    private _cdpHandler: CDPHandler;
    private _context: vscode.ExtensionContext;

    // Default interval in ms
    private _currentInterval: number = 2000;

    // Handlers for specific auto-accept tasks
    private _fileAcceptHandler: () => Promise<void>;
    private _terminalAcceptHandler: () => Promise<void>;
    private _contextHealthCheck?: () => Promise<void>;

    constructor(
        context: vscode.ExtensionContext,
        stateManager: StateManager,
        fileHandler: () => Promise<void>,
        terminalHandler: () => Promise<void>,
        cdpHandler: CDPHandler
    ) {
        this._context = context;
        this._stateManager = stateManager;
        this._fileAcceptHandler = fileHandler;
        this._terminalAcceptHandler = terminalHandler;
        this._cdpHandler = cdpHandler;

        // Listen for configuration changes to polling speed
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('autoContinue.pollingSpeed')) {
                this.updateIntervalSpeed();
            }
        });

        this.updateIntervalSpeed();
    }

    /**
     * Inject an optional context health check that runs every interval
     */
    public setContextHealthCheck(checker: () => Promise<void>) {
        this._contextHealthCheck = checker;
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

        // Start CDP session injection for DOM Scraping Antigravity Auto-Accept
        this._cdpHandler.start(this._context).catch(e => console.error("[Auto-Continue CDP] Start failed:", e));

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

            // Stop CDP websockets
            this._cdpHandler.stop().catch(e => console.error("[Auto-Continue CDP] Stop failed:", e));
        }
    }

    /**
     * The actual polling logic executed every interval
     */
    private async runLoop() {
        try {
            // 0. Supervisor: Check if context handoff needs to happen
            if (this._contextHealthCheck) {
                await this._contextHealthCheck();
            }

            // 1. Check for pending file diffs / apply
            await this._fileAcceptHandler();

            // 2. Check for pending terminal executions
            await this._terminalAcceptHandler();

        } catch (e) {
            console.error(`[Auto-Continue] Error in polling loop:`, e);
        }
    }
}
