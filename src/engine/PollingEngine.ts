import * as vscode from 'vscode';
import { StateManager } from '../state/StateManager';
import { CDPHandler } from './CDPHandler';
import { BoltOnRegistry } from '../boltons/BoltOnRegistry';
import { ZeroTrustValidator } from '../security/ZeroTrustValidator';
import { AgentTaskState } from '../boltons/types';

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

    // Swarm Manager Integration
    private _boltOnRegistry?: BoltOnRegistry;
    private _zeroTrustValidator?: ZeroTrustValidator;

    constructor(
        context: vscode.ExtensionContext,
        stateManager: StateManager,
        fileHandler: () => Promise<void>,
        terminalHandler: () => Promise<void>,
        cdpHandler: CDPHandler,
        boltOnRegistry?: BoltOnRegistry,
        zeroTrustValidator?: ZeroTrustValidator
    ) {
        this._context = context;
        this._stateManager = stateManager;
        this._fileAcceptHandler = fileHandler;
        this._terminalAcceptHandler = terminalHandler;
        this._cdpHandler = cdpHandler;
        this._boltOnRegistry = boltOnRegistry;
        this._zeroTrustValidator = zeroTrustValidator;

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

            // [Swarm Manager] 0.5: Optional check for active Bolt-On intents
            // This demonstrates how the engine routes to a Bolt-On
            await this.processBoltOnTasks();

            // 1. Check for pending file diffs / apply
            await this._fileAcceptHandler();

            // 2. Check for pending terminal executions
            await this._terminalAcceptHandler();

        } catch (e) {
            console.error(`[Auto-Continue] Error in polling loop:`, e);
        }
    }

    /**
     * [Swarm Manager] Processes any pending agent intents through the Bolt-On registry
     * and strictly validates the execution using the ZeroTrustValidator.
     */
    private async processBoltOnTasks() {
        if (!this._boltOnRegistry || !this._zeroTrustValidator) {
            return;
        }

        // Example logic for processing a task state.
        // In a real scenario, this state comes from the local AI router or Antigravity context.
        const pendingTask: AgentTaskState | null = this.fetchPendingTask();

        if (pendingTask) {
            console.log(`[PollingEngine] Found pending intent '${pendingTask.intent}' for task '${pendingTask.taskId}'. Routing...`);

            try {
                // Route to the correct Bolt-On (throws loud error if not found)
                const boltOn = this._boltOnRegistry.get(pendingTask.intent);

                // 1. Hard Contract Enforcement: Pre-conditions
                this._zeroTrustValidator.validateExecutionStart(boltOn, pendingTask);

                // 2. Execution
                const result = await boltOn.execute(pendingTask);

                // 3. Hard Contract Enforcement: Post-conditions
                this._zeroTrustValidator.validateExecutionEnd(boltOn, result);

                console.log(`[PollingEngine] Task '${pendingTask.taskId}' completed successfully via Bolt-On '${boltOn.id}'.`);
            } catch (error) {
                // Catching loud errors from ZeroTrustValidator or Registry
                console.error(`[PollingEngine] Swarm Manager routing/validation failed:`, error);
                // Here we would typically halt the agent or trigger a recovery mechanism
            }
        }
    }

    /**
     * Mocks fetching a pending task from the global state/router.
     */
    private fetchPendingTask(): AgentTaskState | null {
        // Mock returning null so it doesn't break the existing loop,
        // but this shows where the integration point is.
        return null;
    }
}
