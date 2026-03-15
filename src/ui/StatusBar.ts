import * as vscode from 'vscode';
import { StateManager } from '../state/StateManager';
import { ContextTracker } from '../engine/ContextTracker';

export class StatusBar implements vscode.Disposable {
    private _statusBarItem: vscode.StatusBarItem;
    private _dashboardItem: vscode.StatusBarItem;
    private _settingsItem: vscode.StatusBarItem;
    private _cdpItem: vscode.StatusBarItem;
    private _stateManager: StateManager;
    private _contextTracker?: ContextTracker;
    private _contextHealthDisposable?: vscode.Disposable;
    private _isCdpActive = false;

    constructor(context: vscode.ExtensionContext, stateManager: StateManager) {
        this._stateManager = stateManager;

        // Create main toggle item
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this._statusBarItem.command = 'auto-continue.toggle';

        // Create Dashboard quick-access item
        this._dashboardItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        this._dashboardItem.command = 'auto-continue.dashboard';
        this._dashboardItem.text = `$(graph) Lineage`;
        this._dashboardItem.tooltip = 'Open Auto-Continue Context Lineage Dashboard';

        // Create Settings quick-access item
        this._settingsItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
        this._settingsItem.command = 'auto-continue.settings';
        this._settingsItem.text = `$(gear)`;
        this._settingsItem.tooltip = 'Open Auto-Continue Settings';

        // Create CDP quick-access item
        this._cdpItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this._cdpItem.command = 'auto-continue.enableCDP';

        context.subscriptions.push(this._statusBarItem, this._dashboardItem, this._settingsItem, this._cdpItem);

        // Initial update
        this.update();
    }

    /**
     * Assigns the context tracker so we can display live memory health
     */
    public setContextTracker(tracker: ContextTracker) {
        this._contextTracker = tracker;

        if (this._contextHealthDisposable) {
            this._contextHealthDisposable.dispose();
        }

        this._contextHealthDisposable = this._contextTracker.onDidChangeHealth(() => {
            this.update();
        });

        this.update();
    }

    public setCdpStatus(isActive: boolean) {
        this._isCdpActive = isActive;
        this.update();
    }

    /**
     * Updates the UI text and icon based on the current state and context health
     */
    public update() {
        if (this._isCdpActive) {
            this._cdpItem.text = `$(check) Swarm CDP`;
            this._cdpItem.tooltip = 'Chrome DevTools Protocol Active (Port Open)';
            this._cdpItem.backgroundColor = undefined;
        } else {
            this._cdpItem.text = `$(warning) Enable Swarm CDP`;
            this._cdpItem.tooltip = 'Click to relaunch VS Code with the CDP debugging port 9000 enabled.';
            this._cdpItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }

        if (this._stateManager.isActive) {
            let text = `$(play-circle) Auto-Continue: ON`;

            // Inject Context Tracker Health if available
            if (this._contextTracker) {
                const healthPct = Math.round(this._contextTracker.getHealthPercentage() * 100);
                let icon = '$(server-environment)';

                if (healthPct >= 90) {
                    icon = '$(warning)';
                    this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                } else if (healthPct >= 75) {
                    this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                } else {
                    this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.focusBackground');
                }

                text = `${icon} Msg/Ctx: ${healthPct}% | ${text}`;
            } else {
                this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.focusBackground');
            }

            this._statusBarItem.text = text;
            this._statusBarItem.tooltip = 'Click to PAUSE Auto-Continue';

        } else {
            this._statusBarItem.text = `$(debug-pause) Auto-Continue: OFF`;
            this._statusBarItem.tooltip = 'Click to START Auto-Continue';
            this._statusBarItem.backgroundColor = undefined;
        }

        this._statusBarItem.show();
        this._dashboardItem.show();
        this._settingsItem.show();
        this._cdpItem.show();
    }

    public dispose() {
        if (this._contextHealthDisposable) {
            this._contextHealthDisposable.dispose();
        }
        this._statusBarItem.dispose();
        this._dashboardItem.dispose();
        this._settingsItem.dispose();
        this._cdpItem.dispose();
    }
}
