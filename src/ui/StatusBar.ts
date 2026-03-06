import * as vscode from 'vscode';
import { StateManager } from '../state/StateManager';

export class StatusBar implements vscode.Disposable {
    private _statusBarItem: vscode.StatusBarItem;
    private _stateManager: StateManager;

    constructor(context: vscode.ExtensionContext, stateManager: StateManager) {
        this._stateManager = stateManager;

        // Create a new status bar item that we can now manage
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this._statusBarItem.command = 'auto-continue.toggle';

        context.subscriptions.push(this._statusBarItem);

        // Initial update
        this.update();
    }

    /**
     * Updates the UI text and icon based on the current state
     */
    public update() {
        if (this._stateManager.isActive) {
            this._statusBarItem.text = `$(play-circle) Auto-Continue: ON`;
            this._statusBarItem.tooltip = 'Click to PAUSE Auto-Continue';
            this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.focusBackground');
        } else {
            this._statusBarItem.text = `$(debug-pause) Auto-Continue: OFF`;
            this._statusBarItem.tooltip = 'Click to START Auto-Continue';
            this._statusBarItem.backgroundColor = undefined;
        }

        this._statusBarItem.show();
    }

    public dispose() {
        this._statusBarItem.dispose();
    }
}
