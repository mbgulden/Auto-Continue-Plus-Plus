import * as vscode from 'vscode';
import { StateManager } from '../state/StateManager';
// Note: We will import BoltOnRegistry directly when Phase 2 wiring happens.
// For now, this is a placeholder UI to show the foundation exists.

export class SwarmWebview {
    public static currentPanel: SwarmWebview | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _stateManager: StateManager;
    private _tosAgreed: boolean = false;

    private constructor(panel: vscode.WebviewPanel, stateManager: StateManager, tosAgreed: boolean) {
        this._panel = panel;
        this._stateManager = stateManager;
        this._tosAgreed = tosAgreed;

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Listen for state changes so the UI reflects polling toggle
        // In a full implementation, we'd add an onActiveToggled event to StateManager,
        // but for the MVP, we can listen to general stat changes to refresh.
        this._stateManager.onDidChangeStats(() => {
            this._update();
        });
    }

    public static createOrShow(stateManager: StateManager, tosAgreed: boolean) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (SwarmWebview.currentPanel) {
            SwarmWebview.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'swarmOrchestrator',
            'Swarm Orchestrator Manager',
            column || vscode.ViewColumn.One,
            { enableScripts: true }
        );

        SwarmWebview.currentPanel = new SwarmWebview(panel, stateManager, tosAgreed);
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    public dispose() {
        SwarmWebview.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _getHtmlForWebview(): string {
        const isPolling = this._stateManager.isActive;
        const tosStatus = this._tosAgreed ? 'Agreed ✅' : 'Pending ❌';
        const pollingStatus = isPolling ? 'Active 🟢' : 'Idle ⏸️';

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Swarm Orchestrator Manager (MVP)</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); max-width: 800px; margin: 0 auto;}
                h1 { border-bottom: 2px solid var(--vscode-terminal-ansiYellow); padding-bottom: 10px; margin-top: 0;}
                .status-card { background: var(--vscode-editorWidget-background); padding: 20px; border-radius: 8px; border: 1px solid var(--vscode-widget-border); margin-bottom: 20px;}
                .status-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
                .status-row:last-child { border-bottom: none; }
                .label { font-weight: bold; opacity: 0.8; }
                .value { font-family: monospace; font-size: 1.1em; }

                h2 { margin-top: 30px; color: var(--vscode-terminal-ansiCyan); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px;}
                .empty-state { text-align: center; padding: 40px; opacity: 0.5; font-style: italic; border: 1px dashed var(--vscode-widget-border); border-radius: 8px;}
            </style>
        </head>
        <body>
            <h1>💠 Swarm Orchestrator (MVP)</h1>

            <div class="status-card">
                <div class="status-row">
                    <span class="label">Terms of Service (Global)</span>
                    <span class="value">${tosStatus}</span>
                </div>
                <div class="status-row">
                    <span class="label">Engine Polling Status</span>
                    <span class="value">${pollingStatus}</span>
                </div>
            </div>

            <h2>Registered Bolt-Ons (Coming Soon)</h2>
            <div class="empty-state">
                No Bolt-Ons actively wired to the core loop yet.<br>
                <em>(The Registry and Validators are secure, awaiting MVP wiring in Phase 2)</em>
            </div>

            <p style="text-align: center; opacity: 0.5; font-size: 0.8em; margin-top: 40px;">
                Auto-Continue Plus Plus - Bolt-On Architecture MVP
            </p>
        </body>
        </html>`;
    }
}
