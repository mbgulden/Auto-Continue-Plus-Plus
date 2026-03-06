import * as vscode from 'vscode';
import { StateManager } from './state/StateManager';
import { StatusBar } from './ui/StatusBar';
import { PollingEngine } from './engine/PollingEngine';
import { BanList } from './security/BanList';
import { Watchdog } from './engine/Watchdog';

/**
 * Extension entry point.
 * This method is called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Auto-Continue Plus Plus is now active.');

    // Initialize Security and State
    const stateManager = new StateManager(context);
    const banList = new BanList();

    // Initialize UI Features
    const statusBar = new StatusBar(context, stateManager);

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
            const allCommands = await vscode.commands.getCommands(true);
            for (const cmd of recoveryCommands) {
                if (allCommands.includes(cmd)) {
                    await vscode.commands.executeCommand(cmd);
                    // console.log(`[Auto-Continue] Executed recovery command: ${cmd}`);
                }
            }
        } catch (e) {
            console.error('[Auto-Continue] Recovery error:', e);
        }

        vscode.window.showWarningMessage('Auto-Continue: Agent appeared stuck. Attempting recovery...');
        stateManager.incrementStat('recoveries');
    };

    const watchdog = new Watchdog(stateManager, handleRecovery);

    // Dynamic File Accept Handler
    const handleFileAccept = async () => {
        try {
            // Try to execute known "accept" commands from various agents
            const knownCommands = [
                'antigravity.acceptTask',
                'antigravity.acceptDiff',
                'cline.acceptDiff',
                'continue.acceptDiff',
                'cursor.acceptAll'
            ];

            let accepted = false;
            const allCommands = await vscode.commands.getCommands(true);

            for (const cmd of knownCommands) {
                if (allCommands.includes(cmd)) {
                    // We attempt validation before blind execution if we could hook into the diff.
                    // For now, directly fire the command to the agent's webview
                    await vscode.commands.executeCommand(cmd);
                    accepted = true;
                }
            }

            if (accepted) {
                watchdog.ping(); // Agent is alive!
                stateManager.incrementStat('files');
            }
        } catch (e) {
            // Command might fail if there's nothing to accept right now, silently ignore
        }
    };

    // Dynamic Terminal Accept Handler
    const handleTerminalAccept = async () => {
        try {
            // For safety, checking banlist against raw terminal text is hard dynamically 
            // without a pty wrapper. Instead, we call the agent's explicit confirmation command.
            // If the agent exposes a command to "allow terminal execution", we trigger it.
            const knownTerminalCommands = [
                'antigravity.confirmTerminal',
                'cline.confirmCommand',
                'continue.confirmCommand'
            ];

            let executed = false;
            const allCommands = await vscode.commands.getCommands(true);

            for (const cmd of knownTerminalCommands) {
                if (allCommands.includes(cmd)) {
                    // Ideally, we fetch the command text from the Webview before accepting 
                    // and check: if (!banList.isBanned(commandText)) { execute() }
                    await vscode.commands.executeCommand(cmd);
                    executed = true;
                }
            }

            if (executed) {
                watchdog.ping(); // Agent is making moves!
                stateManager.incrementStat('commands');
            }

        } catch (e) {
            // Silently ignore if nothing to accept
        }
    };

    // Initialize Core Engine
    const pollingEngine = new PollingEngine(stateManager, handleFileAccept, handleTerminalAccept);

    // Register Commands
    const toggleCommand = vscode.commands.registerCommand('auto-continue.toggle', () => {
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

    context.subscriptions.push(toggleCommand, settingsCommand, statusBar);

    // If enabled on startup, start engines immediately
    if (stateManager.isActive) {
        pollingEngine.start();
        watchdog.start();
    }
}

/**
 * This method is called when the extension is deactivated.
 */
export function deactivate() {
    console.log('Auto-Continue Plus Plus deactivated.');
}
