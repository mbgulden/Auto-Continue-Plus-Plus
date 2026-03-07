import * as vscode from 'vscode';
import { StateManager } from './state/StateManager';
import { StatusBar } from './ui/StatusBar';
import { PollingEngine } from './engine/PollingEngine';
import { BanList } from './security/BanList';
import { Watchdog } from './engine/Watchdog';
import { ContextTracker } from './engine/ContextTracker';
import { HandoffProtocol } from './engine/HandoffProtocol';
import { DashboardWebview } from './ui/DashboardWebview';
import { SyncEngine } from './engine/SyncEngine';
import { SwarmLockManager } from './engine/SwarmLockManager';
import { ContractManager } from './engine/ContractManager';
import { SwarmOrchestrator } from './engine/SwarmOrchestrator';
import { CDPHandler } from './engine/CDPHandler';
import { SwarmWebview } from './ui/SwarmWebview';

/**
 * Validates the Global Terms of Service at extension startup.
 * @param context The extension context to read global state from.
 * @returns {Promise<boolean>} True if the user consented, false otherwise.
 */
async function checkGlobalTOS(context: vscode.ExtensionContext): Promise<boolean> {
    const TOS_KEY = 'autoContinue.globalTOSAgreed';
    const hasAgreed = context.globalState.get<boolean>(TOS_KEY, false);

    if (hasAgreed) return true;

    // Extract dynamic version from package.json
    const extensionVersion = context.extension.packageJSON.version || "Unknown";

    const tosMessage = `[Auto-Continue Plus Plus v${extensionVersion}] By using this extension, you acknowledge that it actively automates AI actions, automatically accepts diffs on your behalf, and seamlessly synchronizes AI conversation data across your workspace to support multi-environment roaming. The author is not liable for data loss or unintended AI agent behavior. Do you agree to these terms?`;

    const selection = await vscode.window.showWarningMessage(tosMessage, "I Agree", "Decline");

    if (selection === "I Agree") {
        await context.globalState.update(TOS_KEY, true);
        return true;
    }

    // User declined
    vscode.window.showWarningMessage("Auto-Continue Plus Plus requires TOS acceptance to function. The extension will remain paused and idle.");
    return false;
}

/**
 * Extension entry point.
 * This method is called when the extension is activated.
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('Auto-Continue Plus Plus is now initializing.');

    // Enforce Global TOS before enabling the extension
    const tosAgreed = await checkGlobalTOS(context);

    // Initialize Security and State
    const stateManager = new StateManager(context);
    const banList = new BanList();
    const contextTracker = new ContextTracker(stateManager);
    const syncEngine = new SyncEngine(context);
    const cdpHandler = new CDPHandler();

    // Initialize UI Features
    const statusBar = new StatusBar(context, stateManager);
    statusBar.setContextTracker(contextTracker); // Link UI to live tracker

    const lockManager = new SwarmLockManager();
    const contractManager = new ContractManager();
    const handoffProtocol = new HandoffProtocol(stateManager, contextTracker, contractManager, cdpHandler);
    const swarmOrchestrator = new SwarmOrchestrator(handoffProtocol, contractManager, lockManager);

    // Recovery Protocol for Stuck Agents
    const handleRecovery = async () => {
        console.warn('[Auto-Continue] Executing Recovery Protocol...');

        try {
            // Attempt to trigger common retry/wake-up commands
            const recoveryCommands = [
                'antigravity.retry',
                'cline.retry',
                'continue.retry'
            ];
            const allCommands = await getCachedCommands();
            for (const cmd of recoveryCommands) {
                if (allCommands.includes(cmd)) {
                    await vscode.commands.executeCommand(cmd);
                }
            }
        } catch (e) {
            console.error('[Auto-Continue] Recovery error:', e);
        }

        vscode.window.showWarningMessage('Auto-Continue: Agent appeared stuck. Attempting recovery...');
        stateManager.incrementStat('recoveries');
    };

    const watchdog = new Watchdog(stateManager, handleRecovery);

    // Efficiently cache commands to prevent fetching them twice every interval loop
    let cachedCommands: string[] = [];
    let lastCommandFetch = 0;
    const getCachedCommands = async (): Promise<string[]> => {
        const now = Date.now();
        // Fetch more frequently (every 10s) to catch newly registered commands when agent is invoked
        if (now - lastCommandFetch > 10000 || cachedCommands.length === 0) {
            cachedCommands = await vscode.commands.getCommands(true);
            lastCommandFetch = now;
        }
        return cachedCommands;
    };

    // Helper to attempt running the accepting commands ensuring the webview can process them
    const executeAcceptCommands = async (commandsList: string[]): Promise<boolean> => {
        let executed = false;
        const allCommands = await getCachedCommands();
        for (const cmd of commandsList) {
            if (allCommands.includes(cmd)) {
                await vscode.commands.executeCommand(cmd);
                executed = true;
            }
        }
        return executed;
    };

    // Dynamic File Accept Handler
    const handleFileAccept = async () => {
        // Prevent accepts if we are in the middle of a handoff override
        if (handoffProtocol.isHandingOff) return;

        try {
            const knownCommands = [
                // --- Antigravity ---
                // Native Auto-Accept commands that work even when webview is backgrounded/minified
                'antigravity.agent.acceptAgentStep',
                'antigravity.command.accept',
                'antigravity.prioritized.agentAcceptFocusedHunk',

                // --- Cline ---
                'cline.acceptAll',
                'cline.acceptAllFiles',
                'cline.acceptAllDiffs',
                'cline.acceptDiff',
                'cline.acceptTask',

                // --- Roo Code ---
                'roo-cline.acceptAll',
                'roo-cline.acceptAllFiles',
                'roo-cline.acceptAllDiffs',
                'roo-cline.acceptDiff',
                'roo-cline.acceptTask',

                // --- Continue ---
                'continue.acceptAll',
                'continue.acceptAllDiffs',
                'continue.acceptDiff',

                // --- Cursor ---
                'cursor.acceptAll',
                'cursor.acceptDiff'
            ];

            const accepted = await executeAcceptCommands(knownCommands);

            if (accepted) {
                watchdog.ping(); // Agent is alive!
                contextTracker.markAgentActivity();
                statusBar.update();
                stateManager.incrementStat('files');
            }
        } catch (e) { }
    };

    // Dynamic Terminal Accept Handler
    const handleTerminalAccept = async () => {
        if (handoffProtocol.isHandingOff) return;

        try {
            const knownTerminalCommands = [
                // --- Antigravity ---
                'antigravity.terminalCommand.accept',
                'antigravity.agent.acceptAgentStep',
                'antigravity.command.accept',

                // --- Cline ---
                'cline.confirmCommand',
                'cline.runCommand',
                'cline.runTerminalCommand',
                'cline.acceptCommand',
                'cline.proceed',

                // --- Roo Code ---
                'roo-cline.confirmCommand',
                'roo-cline.runCommand',
                'roo-cline.runTerminalCommand',
                'roo-cline.acceptCommand',
                'roo-cline.proceed',

                // --- Continue ---
                'continue.confirmCommand',
                'continue.acceptTerminalCommand',
                'continue.runTerminalCommand',

                // --- Cursor ---
                'cursor.confirmCommand',
                'cursor.runCommand'
            ];

            const executed = await executeAcceptCommands(knownTerminalCommands);

            if (executed) {
                watchdog.ping(); // Agent is making moves!
                contextTracker.markAgentActivity();
                contextTracker.addEstimatedTokens(100);
                statusBar.update();
                stateManager.incrementStat('commands');
            }

        } catch (e) { }
    };

    // Initialize Core Engine
    const pollingEngine = new PollingEngine(context, stateManager, handleFileAccept, handleTerminalAccept, cdpHandler);

    // Bind the context health check directly to the polling interval
    pollingEngine.setContextHealthCheck(async () => {
        if (contextTracker.isOverloaded() && contextTracker.isStable() && !handoffProtocol.isHandingOff) {
            if (contextTracker.isAgentDriving()) {
                await handoffProtocol.executeHandoff();
                statusBar.update();
            } else {
                contextTracker.warnHumanOfOverload();
            }
        }
    });

    // Register Commands
    const toggleCommand = vscode.commands.registerCommand('auto-continue.toggle', () => {
        if (!context.globalState.get('autoContinue.globalTOSAgreed', false)) {
            vscode.window.showErrorMessage('You must agree to the Terms of Service. Please reload the window.');
            return;
        }

        stateManager.toggleActive();
        statusBar.update();

        if (stateManager.isActive) {
            pollingEngine.start();
            watchdog.start();
        } else {
            pollingEngine.stop();
            watchdog.stop();
        }
    });

    const settingsCommand = vscode.commands.registerCommand('auto-continue.settings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'Auto-Continue');
    });

    const dashboardCommand = vscode.commands.registerCommand('auto-continue.dashboard', () => {
        DashboardWebview.createOrShow(stateManager, contextTracker);
    });

    const forceSyncCommand = vscode.commands.registerCommand('auto-continue.forceSync', async () => {
        if (!context.globalState.get('autoContinue.globalTOSAgreed', false)) {
            vscode.window.showErrorMessage('You must agree to the Terms of Service to sync.');
            return;
        }
        await syncEngine.runContinuousSync();
        vscode.window.showInformationMessage('Auto-Continue Sync: Bidirectional sync complete.');
    });

    const spawnSwarmCommand = vscode.commands.registerCommand('auto-continue.swarm.spawnDelegates', async () => {
        if (!context.globalState.get('autoContinue.globalTOSAgreed', false)) {
            vscode.window.showErrorMessage('You must agree to the Terms of Service to use the Swarm.');
            return;
        }
        SwarmWebview.createOrShow(swarmOrchestrator);
    });

    context.subscriptions.push(
        toggleCommand,
        settingsCommand,
        dashboardCommand,
        forceSyncCommand,
        spawnSwarmCommand,
        statusBar,
        contextTracker,
        { dispose: () => lockManager.dispose() }
    );

    // Provide an Audit Trail / Hard Enforcement for Swarm Locks
    context.subscriptions.push(
        vscode.workspace.onWillSaveTextDocument(e => {
            if (stateManager.isActive && lockManager.isLocked(e.document.uri.fsPath)) {
                const owner = lockManager.getLockOwner(e.document.uri.fsPath);
                // We use showWarningMessage to create an audit trail toast without crashing VS Code
                vscode.window.showWarningMessage(`[Swarm Lock Violation] File ${e.document.fileName} is currently CHECKED OUT by Worker Agent: ${owner}. Concurrent edits may cause data loss!`);
            }
        })
    );

    // If enabled on startup AND agreed to TOS, start engines immediately
    if (stateManager.isActive && tosAgreed) {
        pollingEngine.start();
        watchdog.start();
    }

    // Set up a background timer for Continuous Sync (every 5 minutes)
    if (tosAgreed) {
        // Run an initial sync immediately upon load
        syncEngine.runContinuousSync();

        const SYNC_INTERVAL_MS = 5 * 60 * 1000;
        const syncInterval = setInterval(() => {
            if (stateManager.isActive) {
                syncEngine.runContinuousSync();
            }
        }, SYNC_INTERVAL_MS);

        context.subscriptions.push({ dispose: () => clearInterval(syncInterval) });
    }
}

export function deactivate() {
    console.log('Auto-Continue Plus Plus deactivated.');
}
