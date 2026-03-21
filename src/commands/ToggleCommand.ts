import * as vscode from 'vscode';
import { StateManager } from '../state/StateManager';
import { StatusBar } from '../ui/StatusBar';
import { PollingEngine } from '../engine/PollingEngine';
import { Watchdog } from '../engine/Watchdog';
import { checkGlobalTOS } from '../utils/tos';

export function registerToggleCommand(
    context: vscode.ExtensionContext,
    stateManager: StateManager,
    statusBar: StatusBar,
    pollingEngine: PollingEngine,
    watchdog: Watchdog
): vscode.Disposable {
    return vscode.commands.registerCommand('auto-continue.toggle', async () => {
        const agreed = await checkGlobalTOS(context);
        if (!agreed) return;

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
}
