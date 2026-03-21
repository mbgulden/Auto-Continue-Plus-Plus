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
import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { BoltOnRegistry } from './boltons/BoltOnRegistry';
import { ZeroTrustValidator } from './security/ZeroTrustValidator';
import { FileReaderWriterBoltOn } from './boltons/impl/FileReaderWriterBoltOn';
import { BudgetManager } from './engine/BudgetManager';
import { UnitTestingBoltOn } from './boltons/impl/UnitTestingBoltOn';
import { ExternalBoltOnAdapter } from './boltons/ExternalBoltOnAdapter';

import { checkGlobalTOS } from './utils/tos';
import { registerToggleCommand } from './commands/ToggleCommand';
import { registerSettingsCommand } from './commands/SettingsCommand';
import { registerDashboardCommand } from './commands/DashboardCommand';
import { registerForceSyncCommand } from './commands/ForceSyncCommand';
import { registerSpawnSwarmCommand } from './commands/SpawnSwarmCommand';
import { registerEnableCDPCommand } from './commands/EnableCDPCommand';
import { registerCreateShortcutCommand } from './commands/CreateShortcutCommand';

/**
 * Extension entry point.
 * This method is called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Auto-Continue Plus Plus is now initializing.');

    // Initialize Security and State
    const stateManager = new StateManager(context);
    const banList = new BanList();
    const contextTracker = new ContextTracker(stateManager);
    const syncEngine = new SyncEngine(context);
    const cdpHandler = new CDPHandler();
    const budgetManager = BudgetManager.getInstance(stateManager);

    // Initialize UI Features
    const statusBar = new StatusBar(context, stateManager);
    statusBar.setContextTracker(contextTracker); // Link UI to live tracker

    const lockManager = new SwarmLockManager();
    const contractManager = new ContractManager();
    const handoffProtocol = new HandoffProtocol(stateManager, contextTracker, contractManager, cdpHandler);

    // Initialize Bolt-On Infrastructure
    const zeroTrustValidator = new ZeroTrustValidator();
    const boltOnRegistry = new BoltOnRegistry();

    // Register Default Bolt-Ons
    const fileReaderWriter = new FileReaderWriterBoltOn(contractManager, lockManager);
    boltOnRegistry.register(fileReaderWriter);

    const unitTestingBoltOn = new UnitTestingBoltOn();
    boltOnRegistry.register(unitTestingBoltOn);

    const swarmOrchestrator = new SwarmOrchestrator(handoffProtocol, contractManager, lockManager, boltOnRegistry, budgetManager, zeroTrustValidator);

    // Provide initial UI state for CDP
    cdpHandler.isCDPAvailable().then(isActive => statusBar.setCdpStatus(isActive));

    // Recovery Protocol for Stuck Agents
    const handleRecovery = async () => {
        console.warn('[Auto-Continue] Executing Recovery Protocol...');

        try {
            // Attempt to trigger common retry/wake-up commands blindly
            const recoveryCommands = [
                'antigravity.retry',
                'cline.retry',
                'continue.retry'
            ];
            for (const cmd of recoveryCommands) {
                try {
                    await vscode.commands.executeCommand(cmd);
                } catch (e: any) {
                    // Ignore not found silently
                }
            }
        } catch (e) {
            console.error('[Auto-Continue] Recovery error:', e);
        }

        vscode.window.showWarningMessage('Auto-Continue: Agent appeared stuck. Attempting recovery...');
        stateManager.incrementStat('recoveries');
    };

    const watchdog = new Watchdog(stateManager, handleRecovery);

    // Helper to attempt running the accepting commands ensuring the webview can process them
    const executeAcceptCommands = async (commandsList: string[]): Promise<boolean> => {
        let executed = false;
        for (const cmd of commandsList) {
            try {
                await vscode.commands.executeCommand(cmd);
                executed = true;
            } catch (e: any) {
                // Silently ignore "command not found" errors as extensions lazily load,
                // but log other potential issues if necessary.
                if (e && e.message && !e.message.includes('not found')) {
                    console.debug(`[Auto-Continue] Command ${cmd} failed:`, e.message);
                }
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

    const toggleCommand = registerToggleCommand(context, stateManager, statusBar, pollingEngine, watchdog);
    const settingsCommand = registerSettingsCommand();
    const dashboardCommand = registerDashboardCommand(stateManager, contextTracker);
    const forceSyncCommand = registerForceSyncCommand(context, syncEngine);
    const spawnSwarmCommand = registerSpawnSwarmCommand(context, swarmOrchestrator, stateManager, boltOnRegistry, budgetManager);
    const enableCDPCommand = registerEnableCDPCommand(context, cdpHandler);
    const createShortcutCommand = registerCreateShortcutCommand();

    context.subscriptions.push(
        toggleCommand,
        settingsCommand,
        dashboardCommand,
        forceSyncCommand,
        spawnSwarmCommand,
        enableCDPCommand,
        createShortcutCommand,
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

    // Start the process asynchronously so we don't block extension activation
    checkGlobalTOS(context).then(tosAgreed => {
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
    });

    // Provide the Orchestration API for Spoke extensions
    return Object.freeze({
        registerBoltOn: (boltOn: any) => {
            console.log(`[Antigravity Hub] Received external Spoke registration: ${boltOn.name || boltOn.id}`);
            const adapter = new ExternalBoltOnAdapter(boltOn);
            boltOnRegistry.register(adapter);
            vscode.window.showInformationMessage(`Antigravity Hub: Successfully loaded Spoke '${boltOn.name || boltOn.id}'`);
        }
    });
}

export function deactivate() {
    console.log('Auto-Continue Plus Plus deactivated.');
}
