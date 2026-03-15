import * as vscode from 'vscode';
import { SwarmOrchestrator } from '../engine/SwarmOrchestrator';
import { StateManager } from '../state/StateManager';
import { BoltOnRegistry } from '../boltons/BoltOnRegistry';

export class SwarmWebview {
    public static currentPanel: SwarmWebview | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    // Dependencies
    private _orchestrator: SwarmOrchestrator;
    private _stateManager: StateManager;
    private _boltOnRegistry: BoltOnRegistry;

    private constructor(panel: vscode.WebviewPanel, orchestrator: SwarmOrchestrator, stateManager: StateManager, boltOnRegistry: BoltOnRegistry) {
        this._panel = panel;
        this._orchestrator = orchestrator;
        this._stateManager = stateManager;
        this._boltOnRegistry = boltOnRegistry;

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update UI every few seconds to show live status
        const interval = setInterval(() => {
            if (this._panel.visible) this._update();
        }, 3000);
        this._disposables.push({ dispose: () => clearInterval(interval) });

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'refresh':
                        this._update();
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(orchestrator: SwarmOrchestrator, stateManager: StateManager, boltOnRegistry: BoltOnRegistry) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (SwarmWebview.currentPanel) {
            SwarmWebview.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'swarmOrchestrator',
            'Swarm Manager Dashboard',
            column || vscode.ViewColumn.One,
            { enableScripts: true }
        );

        SwarmWebview.currentPanel = new SwarmWebview(panel, orchestrator, stateManager, boltOnRegistry);
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    public dispose() {
        SwarmWebview.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }

    private _getHtmlForWebview(): string {
        const isActive = this._stateManager.isActive;
        const statusText = isActive ? "🟢 Polling Active" : "⏸️ Paused (Toggle via Command Palette)";
        
        // For MVP, we know TOS is agreed if they can open the webview (we prompt in activate/toggle)
        const tosStatus = "✅ TOS Agreed";
        
        const registeredBoltOns = this._boltOnRegistry.getAll();
        
        let boltOnHtml = '';
        if (registeredBoltOns.length > 0) {
            registeredBoltOns.forEach(b => {
                boltOnHtml += `<div class="card">
                    <h3>🧩 ${b.id}</h3>
                    <p>${b.description || 'No description provided.'}</p>
                </div>`;
            });
        } else {
            boltOnHtml = `<div class="empty-state">No Bolt-Ons registered yet. Waiting for extension to register skills...</div>`;
        }

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Swarm Manager Dashboard</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); max-width: 800px; margin: 0 auto; }
                h1 { border-bottom: 2px solid var(--vscode-terminal-ansiYellow); padding-bottom: 10px; margin-top: 0; }
                h2 { color: var(--vscode-terminal-ansiCyan); margin-top: 30px; }
                .status-board { background: var(--vscode-editorWidget-background); padding: 20px; border-radius: 8px; border: 1px solid var(--vscode-widget-border); margin-bottom: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .status-item { font-size: 1.2em; margin-bottom: 12px; font-weight: bold; display: flex; align-items: center; }
                
                .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-editorGroup-border); border-left: 4px solid var(--vscode-terminal-ansiCyan); border-radius: 6px; padding: 15px; margin-bottom: 15px; transition: transform 0.2s; }
                .card:hover { transform: translateX(5px); border-left-color: var(--vscode-terminal-ansiYellow); }
                .card h3 { margin: 0 0 8px 0; color: var(--vscode-terminal-ansiCyan); font-size: 1.1em; }
                .card p { margin: 0; opacity: 0.8; font-size: 0.95em; line-height: 1.4; }
                
                .empty-state { padding: 30px; text-align: center; opacity: 0.5; font-style: italic; border: 1px dashed var(--vscode-widget-border); border-radius: 8px; }
                
                .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 10px 20px; cursor: pointer; border-radius: 4px; font-size: 1em; font-weight: bold; transition: opacity 0.2s; }
                .btn-primary:hover { opacity: 0.9; }
            </style>
        </head>
        <body>
            <h1>💠 Swarm Manager Dashboard</h1>
            
            <div class="status-board">
                <h2 style="margin-top: 0;">Engine Status</h2>
                <div class="status-item">${statusText}</div>
                <div class="status-item">${tosStatus}</div>
            </div>

            <h2>Registered Bolt-Ons (Proof of Work)</h2>
            <p style="opacity: 0.8; margin-bottom: 20px;">The following Zero-Trust skills and qualification standards are currently loaded into the routing engine:</p>
            <div id="boltons-container">
                ${boltOnHtml}
            </div>

            <div style="margin-top: 30px; text-align: center;">
                <button class="btn-primary" onclick="refresh()">↻ Refresh Dashboard</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                function refresh() {
                    vscode.postMessage({ command: 'refresh' });
                }
            </script>
        </body>
        </html>`;
    }
}
