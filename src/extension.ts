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
import { BoltOnRegistry } from './boltons/BoltOnRegistry';
import { ZeroTrustValidator } from './security/ZeroTrustValidator';
import { FileReaderWriterBoltOn } from './boltons/impl/FileReaderWriterBoltOn';
import { BudgetManager } from './engine/BudgetManager';

/**
 * Validates the Global Terms of Service.
 * @param context The extension context to read global state from.
 * @returns {Promise<boolean>} True if the user consented, false otherwise.
 */
async function checkGlobalTOS(context: vscode.ExtensionContext): Promise<boolean> {
    const TOS_KEY = 'autoContinue.globalTOSAgreed';
    const hasAgreedForever = context.globalState.get<boolean>(TOS_KEY, false);

    if (hasAgreedForever) return true;

    // Extract dynamic version from package.json
    const extensionVersion = context.extension.packageJSON.version || "Unknown";

    const tosMessage = `[Auto-Continue Plus Plus v${extensionVersion}] By using this extension, you acknowledge that it actively automates AI actions, automatically accepts diffs on your behalf, and seamlessly synchronizes AI conversation data across your workspace to support multi-environment roaming. The author is not liable for data loss or unintended AI agent behavior. Do you agree to these terms?`;

    const selection = await vscode.window.showWarningMessage(tosMessage, "I Agree", "Don't Show Again", "Decline");

    if (selection === "Don't Show Again") {
        await context.globalState.update(TOS_KEY, true);
        return true;
    } else if (selection === "I Agree") {
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

    const swarmOrchestrator = new SwarmOrchestrator(handoffProtocol, contractManager, lockManager, boltOnRegistry, budgetManager);

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
        // We no longer `await` blindly here because some VS Code extensions 
        // return Promises that hang indefinitely if they pop up a QuickPick UI (e.g. "Select Python Interpreter").
        // We fire and forget with aggressive catching.
        for (const cmd of commandsList) {
            vscode.commands.executeCommand(cmd).then(undefined, (e) => {
                // Silently ignore command missing errors
                if (e && e.message && !e.message.includes('not found')) {
                    console.debug(`[Auto-Continue] Command ${cmd} failed:`, e.message);
                }
            });
        }
        return false;
    };

    // Dynamic File Accept Handler
    const handleFileAccept = async () => {
        // Prevent accepts if we are in the middle of a handoff override
        if (handoffProtocol.isHandingOff) return;

        try {
            // We heavily reduced the blind command list to prevent accidental side effects
            // (like triggering the Python Interpreter selector) from other installed extensions.
            const knownCommands = [
                // --- Antigravity ---
                'antigravity.agent.acceptAgentStep',
                'antigravity.command.accept',
                'antigravity.prioritized.agentAcceptFocusedHunk'
            ];

            await executeAcceptCommands(knownCommands);
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
                'antigravity.command.accept'
            ];

            await executeAcceptCommands(knownTerminalCommands);
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

    const toggleCommand = vscode.commands.registerCommand('auto-continue.toggle', async () => {
        if (!stateManager.isActive) {
            // Turning ON - must check TOS every time (unless "Don't Show Again" was previously checked)
            const agreed = await checkGlobalTOS(context);
            if (!agreed) {
                return;
            }
        }

        stateManager.toggleActive();
        statusBar.update();

        if (stateManager.isActive) {
            const isCdpAvailable = await cdpHandler.isCDPAvailable();
            if (!isCdpAvailable && !vscode.env.remoteName) {
                vscode.window.showWarningMessage('Auto-Continue Warning: Swarm CDP is OFFLINE. The auto-accept feature requires the CDP Debugging tool. Please click "Enable Swarm CDP" in your status bar to restart VS Code locally with the required port.');
            } else if (!isCdpAvailable && vscode.env.remoteName) {
                vscode.window.showWarningMessage('Auto-Continue Warning: You are connected via Remote SSH. Please manually restart your LOCAL VS Code window with the "--remote-debugging-port=9000" flag before connecting, or auto-accept will fail.');
            }

            pollingEngine.start();
            watchdog.start();
            syncEngine.runContinuousSync();
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
        const agreed = await checkGlobalTOS(context);
        if (!agreed) {
            vscode.window.showErrorMessage('You must agree to the Terms of Service to use the Swarm.');
            return;
        }
        SwarmWebview.createOrShow(swarmOrchestrator, stateManager, boltOnRegistry, budgetManager);
    });

    const enableCDPCommand = vscode.commands.registerCommand('auto-continue.enableCDP', async () => {
        // Prevent action if already active
        const isActive = await cdpHandler.isCDPAvailable();
        if (isActive) {
            vscode.window.showInformationMessage('Swarm CDP is already active (Port Open). No restart needed.');
            return;
        }

        // Prevent action if remote host (since spawning code will be headless/remote)
        if (vscode.env.remoteName) {
            vscode.window.showWarningMessage('Auto-Continue: You are connected via Remote SSH. Please manually restart your local VS Code window with the "--remote-debugging-port=9000" flag. Auto-relaunch is not supported remotely.');
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No active workspace available to relaunch.');
            return;
        }

        const projectPath = workspaceFolders[0].uri.fsPath;
        vscode.window.showInformationMessage('Auto-Continue: Relaunching VS Code with CDP Debugging enabled...');

        // Wait a tiny bit for the UI to update with the message
        await new Promise(resolve => setTimeout(resolve, 800));

        // Spawn a detached process to re-open the window
        // Depending on platform, sometimes simply passing `.` works, but being explicit with path is safer
        const child = cp.spawn('code', [projectPath, '--remote-debugging-port=9000'], {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();

        // Close the current window so it restarts essentially
        await vscode.commands.executeCommand('workbench.action.closeWindow');
    });

    context.subscriptions.push(
        toggleCommand,
        settingsCommand,
        dashboardCommand,
        forceSyncCommand,
        spawnSwarmCommand,
        enableCDPCommand,
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

    // Decide startup state based on enableAtStartup config
    if (stateManager.isActive) {
        // Only start if they agree to TOS
        checkGlobalTOS(context).then(tosAgreed => {
            if (tosAgreed) {
                pollingEngine.start();
                watchdog.start();
                syncEngine.runContinuousSync();
            } else {
                stateManager.forceState(false);
                statusBar.update();
            }
        });
    }

    // The interval is always running but only does work when active
    const SYNC_INTERVAL_MS = 5 * 60 * 1000;
    const syncInterval = setInterval(() => {
        if (stateManager.isActive) {
            syncEngine.runContinuousSync();
        }
    }, SYNC_INTERVAL_MS);
    context.subscriptions.push({ dispose: () => clearInterval(syncInterval) });
}

export function deactivate() {
    console.log('Auto-Continue Plus Plus deactivated.');
}
