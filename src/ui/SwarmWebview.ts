import * as vscode from 'vscode';
import { SwarmOrchestrator } from '../engine/SwarmOrchestrator';
import { StateManager } from '../state/StateManager';
import { BoltOnRegistry } from '../boltons/BoltOnRegistry';

export class SwarmWebview {
    public static currentPanel: SwarmWebview | undefined;
    private readonly _panel: vscode.WebviewPanel;

    private _escapeHtml(unsafe: string): string {
        if (!unsafe) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    private _disposables: vscode.Disposable[] = [];

    // Dependencies
    private _orchestrator: SwarmOrchestrator;
    private _stateManager: StateManager;
    private _boltOnRegistry: BoltOnRegistry;

    // UI State
    private _draftContracts: any[] = [];
    private _isDecomposing: boolean = false;
    private _lastPrompt: string = '';

    private constructor(panel: vscode.WebviewPanel, orchestrator: SwarmOrchestrator, stateManager: StateManager, boltOnRegistry: BoltOnRegistry) {
        this._panel = panel;
        this._orchestrator = orchestrator;
        this._stateManager = stateManager;
        this._boltOnRegistry = boltOnRegistry;

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update UI every few seconds to show live status
        const interval = setInterval(() => {
            if (this._panel.visible && !this._isDecomposing) this._update();
        }, 3000);
        this._disposables.push({ dispose: () => clearInterval(interval) });

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'refresh':
                        this._update();
                        return;
                    case 'decompose':
                        await this._handleDecompose(message.prompt);
                        return;
                    case 'launch':
                        await this._handleLaunch(message.contracts);
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

    private async _handleDecompose(prompt: string) {
        if (!prompt.trim()) {
            vscode.window.showWarningMessage("Please enter a Megaprompt first.");
            return;
        }

        this._isDecomposing = true;
        this._lastPrompt = prompt;
        this._update();

        try {
            this._draftContracts = await this._orchestrator.decomposeMegaprompt(prompt);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Decomposition failed: ${e.message}`);
        }

        this._isDecomposing = false;
        this._update();
    }

    private async _handleLaunch(contracts: any[]) {
        if (!contracts || contracts.length === 0) {
            vscode.window.showWarningMessage("No active agents to launch.");
            return;
        }

        const finalizedContracts = contracts.map(c => ({
            threadId: c.threadId,
            role: c.role,
            taskDescription: c.taskDescription,
            allowedDirectories: c.allowedDirectories.split(',').map((s: string) => s.trim()).filter((s: string) => s),
            readOnlyDirectories: c.readOnlyDirectories.split(',').map((s: string) => s.trim()).filter((s: string) => s),
            targetHead: c.targetHead
        }));

        this._draftContracts = []; // clear
        this._update();

        vscode.window.showInformationMessage(`Initiating Triple-Headed Swarm Dispatch...`);
        await this._orchestrator.spawnDelegatesFromContracts(finalizedContracts);
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

        const isWaiting = this._isDecomposing;
        let cardsHtml = '';

        if (this._draftContracts.length > 0 && !isWaiting) {
            cardsHtml = `<div class="card-grid">`;
            this._draftContracts.forEach((contract, index) => {
                cardsHtml += `
                <div class="agent-card card" id="card-${index}">
                    <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <input type="text" class="role-input" value="${contract.role}" id="role-${index}" placeholder="Agent Role">
                        <button class="btn-clear" onclick="deleteCard(${index})" title="Remove Agent">✖</button>
                    </div>

                    <label>Target Execution Head</label>
                    <select id="head-${index}" class="paths-input" style="background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); width: 100%; padding: 8px;">
                        <option value="Antigravity UI" ${contract.targetHead === 'Antigravity UI' ? 'selected' : ''}>Antigravity IDE Sidebar (Queued)</option>
                        <option value="Headless API" ${contract.targetHead === 'Headless API' ? 'selected' : ''}>Headless API Swarm (Parallel)</option>
                        <option value="Local AI" ${contract.targetHead === 'Local AI' ? 'selected' : ''}>Local AI Swarm (Validator/Refactor)</option>
                    </select>

                    <label>Assigned Task Description</label>
                    <textarea class="desc-input" id="desc-${index}" rows="4">${contract.taskDescription}</textarea>

                    <label>Allowed Edit Directories (comma separated)</label>
                    <input type="text" class="paths-input" id="allowed-${index}" value="${Array.isArray(contract.allowedDirectories) ? contract.allowedDirectories.join(', ') : contract.allowedDirectories}">

                    <label>Read-Only Context Directories (comma separated)</label>
                    <input type="text" class="paths-input" id="readonly-${index}" value="${Array.isArray(contract.readOnlyDirectories) ? contract.readOnlyDirectories.join(', ') : contract.readOnlyDirectories}">
                    <input type="hidden" id="thread-${index}" value="${contract.threadId}">
                </div>`;
            });
            cardsHtml += `</div>

            <div style="margin-top: 20px; text-align: center;">
                <button class="btn-primary launch-swarms" onclick="launchSwarm()">
                    🚀 Dispatch ${this._draftContracts.length} Swarm Worker(s)
                </button>
            </div>`;
        } else if (!isWaiting) {
            cardsHtml = `<div class="empty-state">No agents provisioned yet. Describe an objective above.</div>`;
        } else {
            cardsHtml = `<div class="empty-state" style="opacity: 0.8;">⏳ Requesting Decomposition from Gemini API...</div>`;
        }

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Swarm Manager Dashboard</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); max-width: 900px; margin: 0 auto; }
                h1 { border-bottom: 2px solid var(--vscode-terminal-ansiYellow); padding-bottom: 10px; margin-top: 0; }
                h2 { color: var(--vscode-terminal-ansiCyan); margin-top: 30px; }
                .status-board { background: var(--vscode-editorWidget-background); padding: 20px; border-radius: 8px; border: 1px solid var(--vscode-widget-border); margin-bottom: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .status-item { font-size: 1.2em; margin-bottom: 12px; font-weight: bold; display: flex; align-items: center; }

                .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-editorGroup-border); border-left: 4px solid var(--vscode-terminal-ansiCyan); border-radius: 6px; padding: 15px; margin-bottom: 15px; transition: transform 0.2s; }
                .card:hover { transform: translateX(5px); border-left-color: var(--vscode-terminal-ansiYellow); }
                .card h3 { margin: 0 0 8px 0; color: var(--vscode-terminal-ansiCyan); font-size: 1.1em; }
                .card p { margin: 0; opacity: 0.8; font-size: 0.95em; line-height: 1.4; }

                .agent-card { border-left-color: var(--vscode-terminal-ansiGreen); }
                .agent-card:hover { border-left-color: var(--vscode-terminal-ansiYellow); }

                .empty-state { padding: 30px; text-align: center; opacity: 0.5; font-style: italic; border: 1px dashed var(--vscode-widget-border); border-radius: 8px; }

                .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 10px 20px; cursor: pointer; border-radius: 4px; font-size: 1em; font-weight: bold; transition: opacity 0.2s; }
                .btn-primary:hover { opacity: 0.9; }
                .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

                .launch-swarms { padding: 12px 30px; font-size: 1.1em; background: var(--vscode-terminal-ansiGreen); color: black;}

                .role-input { background: transparent; border: none; color: var(--vscode-terminal-ansiCyan); font-size: 1.2em; font-weight: bold; width: 80%; outline: none; border-bottom: 1px dashed transparent;}
                .role-input:focus { border-bottom: 1px dashed var(--vscode-terminal-ansiCyan); }
                .btn-clear { background: transparent; color: var(--vscode-editorError-foreground); border: none; cursor: pointer; font-size: 1.2em; padding: 0;}

                label { display: block; font-size: 0.8em; margin-top: 10px; margin-bottom: 3px; font-weight: bold; opacity: 0.7;}
                .desc-input, .paths-input { width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.1); border: 1px solid var(--vscode-input-border); color: var(--vscode-input-foreground); padding: 8px; font-family: inherit; margin-bottom: 5px; border-radius: 2px;}
                .paths-input { font-family: monospace; font-size: 0.9em; color: var(--vscode-terminal-ansiYellow);}

                .megaprompt-container { background: var(--vscode-editorWidget-background); padding: 20px; border-radius: 8px; border: 1px solid var(--vscode-widget-border); margin-bottom: 25px;}
                textarea.megaprompt { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 10px; font-size: 1em; font-family: inherit; border-radius: 4px; resize: vertical; min-height: 120px;}
            </style>
        </head>
        <body>
            <h1>💠 Headless Swarm Manager</h1>

            <div class="status-board">
                <h2 style="margin-top: 0;">Engine Status</h2>
                <div class="status-item">${statusText}</div>
                <div class="status-item">${tosStatus}</div>
            </div>

            <div class="megaprompt-container">
                <label style="font-size: 1.1em; opacity: 1; margin-bottom: 10px; display: block; color: var(--vscode-terminal-ansiYellow);">1. Define The Swarm Objective</label>
                <textarea id="megaprompt" class="megaprompt" placeholder="Example: Refactor the UI into React components and update the backend Express logic to support user login.">${this._lastPrompt}</textarea>

                <button id="draftBtn" class="btn-primary" onclick="draftSwarm()" ${isWaiting ? 'disabled' : ''}>
                    ${isWaiting ? 'Decomposing via Gemini...' : '✨ Draft Worker Contracts'}
                </button>
            </div>

            <div id="swarms-container">
                <h2 style="margin-bottom: 15px; color: var(--vscode-terminal-ansiCyan);">2. Review Triple-Headed Routing</h2>
                ${cardsHtml}
            </div>

            <h2>Available Proof of Work (Bolt-Ons)</h2>
            <div id="boltons-container">
                ${boltOnHtml}
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function refresh() {
                    vscode.postMessage({ command: 'refresh' });
                }

                function draftSwarm() {
                    const prompt = document.getElementById('megaprompt').value;
                    vscode.postMessage({ command: 'decompose', prompt: prompt });
                }

                function deleteCard(index) {
                    const card = document.getElementById('card-' + index);
                    if (card) {
                        card.style.display = 'none';
                        card.classList.add('deleted');
                    }
                }

                function launchSwarm() {
                    const cards = document.querySelectorAll('.agent-card:not(.deleted)');
                    const contracts = [];

                    cards.forEach(card => {
                        const indexId = card.id.replace('card-', '');
                        contracts.push({
                            threadId: document.getElementById('thread-' + indexId).value,
                            role: document.getElementById('role-' + indexId).value,
                            taskDescription: document.getElementById('desc-' + indexId).value,
                            allowedDirectories: document.getElementById('allowed-' + indexId).value,
                            readOnlyDirectories: document.getElementById('readonly-' + indexId).value,
                            targetHead: document.getElementById('head-' + indexId).value
                        });
                    });

                    vscode.postMessage({ command: 'launch', contracts: contracts });
                }
            </script>
        </body>
        </html>`;
    }
}
