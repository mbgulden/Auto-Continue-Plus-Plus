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
    private _lastTelemetryPing: number = 0;

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
     * Updates polling speed from settings and API limits
     */
    private async updateIntervalSpeed() {
        const config = vscode.workspace.getConfiguration('autoContinue');
        let baseInterval = config.get<number>('pollingSpeed', 2000);

        try {
            // Dynamic Throttle Polling connected to /api/usage
            const isDev = this._context.extensionMode === vscode.ExtensionMode.Development;
            const pythonPort = isDev ? 5002 : 5001;
            const response = await fetch(`http://localhost:${pythonPort}/api/usage`);
            if (response.ok) {
                const data = await response.json();
                const activeModel = data.active_model;
                const activeUsage = data.models?.[activeModel];
                if (activeUsage) {
                    if (activeUsage.status === 'warning') {
                        baseInterval *= 2; // slow down polling 2x
                    } else if (activeUsage.status === 'critical') {
                        baseInterval *= 5; // slow down polling 5x
                    }
                }
            }
        } catch (e) {
            // Supervisor daemon likely down, keep base interval
        }

        this._currentInterval = baseInterval;

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

            // Periodically check throttle status
            if (Math.random() < 0.1) {
                await this.updateIntervalSpeed();
            }

            // Secure Node.js Telemetry Ping (every ~30s instead of injecting fetch in webview)
            const now = Date.now();
            if (now - this._lastTelemetryPing > 30000) {
                this._lastTelemetryPing = now;
                try {
                    const isDev = this._context.extensionMode === vscode.ExtensionMode.Development;
                    const pythonPort = isDev ? 5002 : 5001;
                    fetch(`http://localhost:${pythonPort}/api/telemetry`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ msg: 'CDP Polling Engine Active', level: 'info' })
                    }).catch(() => { /* silent fail if supervisor down */ });
                } catch (e) { }
            }

            // 0.5 Check the React Dashboard Megaprompt Dispatch Queue
            try {
                const isDev = this._context.extensionMode === vscode.ExtensionMode.Development;
                const pythonPort = isDev ? 5002 : 5001;
                const queueRes = await fetch(`http://localhost:${pythonPort}/api/dispatch/queue`);
                if (queueRes.ok) {
                    const queueData = await queueRes.json();
                    if (queueData && queueData.prompt) {
                        try {
                            vscode.commands.executeCommand('auto-continue.swarm.dispatchHeadless', queueData.prompt, !!queueData.use_jules);
                        } catch (e) {
                            console.error("Failed to execute headless payload", e);
                        }
                    }
                }
            } catch (e) { /* ignore disconnected daemon */ }

            // 1. & 2. Try CDP execution first (DOM Scraping payload handles all types of accept logic)
            // It runs synchronously inside the webview without focus requirements.
            await this._cdpHandler.executeGlobalScript('if(window.__autoAcceptState) clickAcceptButtons();');

            // Fallback hierarchy: if CDP fails or isn't enabled, fallback to VS Code native commands
            await this._fileAcceptHandler();
            await this._terminalAcceptHandler();

        } catch (e) {
            console.error(`[Auto-Continue] Error in polling loop:`, e);
        }
    }
}
