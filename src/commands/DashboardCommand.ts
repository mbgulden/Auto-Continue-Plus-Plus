import * as vscode from 'vscode';
import { StateManager } from '../state/StateManager';
import { ContextTracker } from '../engine/ContextTracker';
import { DashboardWebview } from '../ui/DashboardWebview';

export function registerDashboardCommand(
    stateManager: StateManager,
    contextTracker: ContextTracker
): vscode.Disposable {
    return vscode.commands.registerCommand('auto-continue.dashboard', () => {
        DashboardWebview.createOrShow(stateManager, contextTracker);
    });
}
