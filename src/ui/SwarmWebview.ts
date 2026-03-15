import * as vscode from 'vscode';
import { SwarmOrchestrator } from '../engine/SwarmOrchestrator';
import { AgentContract } from '../engine/ContractManager';

export class SwarmWebview {
    public static currentPanel: SwarmWebview | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _orchestrator: SwarmOrchestrator;

    // UI State
    private _draftContracts: AgentContract[] = [];
    private _isDecomposing: boolean = false;
    private _lastPrompt: string = '';

    private constructor(panel: vscode.WebviewPanel, orchestrator: SwarmOrchestrator) {
        this._panel = panel;
        this._orchestrator = orchestrator;

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
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

    public static createOrShow(orchestrator: SwarmOrchestrator) {
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

        SwarmWebview.currentPanel = new SwarmWebview(panel, orchestrator);
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

        // Clean up the JSON from the UI into strict Contracts
        const finalizedContracts: AgentContract[] = contracts.map(c => ({
            threadId: c.threadId,
            role: c.role,
            taskDescription: c.taskDescription,
            allowedDirectories: c.allowedDirectories.split(',').map((s: string) => s.trim()).filter((s: string) => s),
            readOnlyDirectories: c.readOnlyDirectories.split(',').map((s: string) => s.trim()).filter((s: string) => s)
        }));

        this._panel.dispose(); // Close UI
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
            if (x) {
                x.dispose();
            }
        }
    }

    private _getHtmlForWebview(): string {
        const isWaiting = this._isDecomposing;

        let cardsHtml = '';
        if (this._draftContracts.length > 0 && !isWaiting) {
            cardsHtml = `<div class="card-grid">`;
            this._draftContracts.forEach((contract, index) => {
                cardsHtml += `
                <div class="agent-card" id="card-${index}">
                    <div class="card-header">
                        <input type="text" class="role-input" value="${contract.role}" id="role-${index}" placeholder="Agent Role">
                        <button class="btn-clear" onclick="deleteCard(${index})" title="Remove Agent">✖</button>
                    </div>

                    <label>Assigned Task Description</label>
                    <textarea class="desc-input" id="desc-${index}" rows="4">${contract.taskDescription}</textarea>

                    <label>Allowed Edit Directories (comma separated)</label>
                    <input type="text" class="paths-input" id="allowed-${index}" value="${contract.allowedDirectories.join(', ')}">

                    <label>Read-Only Context Directories (comma separated)</label>
                    <input type="text" class="paths-input" id="readonly-${index}" value="${contract.readOnlyDirectories.join(', ')}">
                    <input type="hidden" id="thread-${index}" value="${contract.threadId}">
                </div>`;
            });
            cardsHtml += `</div>

            <div style="margin-top: 20px; text-align: center;">
                <button class="btn-primary launch-swarms" onclick="launchSwarm()">
                    🚀 Launch ${this._draftContracts.length} Swarm Worker(s)
                </button>
            </div>`;
        } else if (!isWaiting) {
            cardsHtml = `<div class="empty-state">No agents provisioned yet. Describe your task above and click 'Draft Swarm'.</div>`;
        } else {
            cardsHtml = `<div class="empty-state" style="opacity: 0.8;">⏳ Reaching out to Gemini 3.1 Pro via API. Please wait while your objective is broken down into parallel tasks...</div>`;
        }

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Swarm Orchestrator UI</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); max-width: 1000px; margin: 0 auto;}
                h1 { border-bottom: 2px solid var(--vscode-terminal-ansiYellow); padding-bottom: 10px; margin-top: 0;}
                .megaprompt-container { background: var(--vscode-editorWidget-background); padding: 20px; border-radius: 8px; border: 1px solid var(--vscode-widget-border); margin-bottom: 25px;}
                textarea.megaprompt { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 10px; font-size: 1em; font-family: inherit; border-radius: 4px; resize: vertical; min-height: 120px;}
                .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 10px 20px; cursor: pointer; border-radius: 4px; font-size: 1em; font-weight: bold; margin-top: 15px; transition: opacity 0.2s;}
                .btn-primary:hover { opacity: 0.9; cursor: pointer; }
                .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
                .launch-swarms { padding: 12px 30px; font-size: 1.1em; background: var(--vscode-terminal-ansiGreen); color: black;}

                .agent-card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-editorGroup-border); border-left: 4px solid var(--vscode-terminal-ansiCyan); border-radius: 6px; padding: 15px; margin-bottom: 15px;}
                .card-header { display: flex; justify-content: space-between; margin-bottom: 10px;}
                .role-input { background: transparent; border: none; color: var(--vscode-terminal-ansiCyan); font-size: 1.2em; font-weight: bold; width: 80%; outline: none; border-bottom: 1px dashed transparent;}
                .role-input:focus { border-bottom: 1px dashed var(--vscode-terminal-ansiCyan); }
                .btn-clear { background: transparent; color: var(--vscode-editorError-foreground); border: none; cursor: pointer; font-size: 1.2em; padding: 0;}

                label { display: block; font-size: 0.8em; margin-top: 10px; margin-bottom: 3px; font-weight: bold; opacity: 0.7;}
                .desc-input, .paths-input { width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.1); border: 1px solid var(--vscode-input-border); color: var(--vscode-input-foreground); padding: 8px; font-family: inherit; margin-bottom: 5px; border-radius: 2px;}
                .paths-input { font-family: monospace; font-size: 0.9em; color: var(--vscode-terminal-ansiYellow);}

                .loader { display: inline-block; width: 15px; height: 15px; border: 3px solid rgba(255,255,255,.3); border-radius: 50%; border-top-color: #fff; animation: spin 1s ease-in-out infinite; margin-right: 8px; vertical-align: middle;}
                @keyframes spin { to { transform: rotate(360deg); } }

                .empty-state { text-align: center; padding: 40px; opacity: 0.5; font-style: italic; border: 1px dashed var(--vscode-widget-border); border-radius: 8px;}
            </style>
        </head>
        <body>
            <h1>💠 Multi-Agent Swarm Orchestrator</h1>

            <div class="megaprompt-container">
                <label style="font-size: 1.1em; opacity: 1; margin-bottom: 10px; display: block; color: var(--vscode-terminal-ansiYellow);">1. Define The Swarm Objective (Megaprompt)</label>
                <p style="font-size: 0.9em; opacity: 0.8; margin-top: 0; line-height: 1.4;">
                    Describe a complex, multi-faceted task. The Gemini 3.1 Pro Manager will analyze this request and automatically decompose it into specialized, sandboxed Worker Agents that will execute concurrently.
                </p>
                <textarea id="megaprompt" class="megaprompt" placeholder="Example: Build a new authentication flow. I need one agent to update the React frontend in src/ui to add the login forms, and another agent to update the Express backend in src/api to handle the JWT validation.">${this._lastPrompt}</textarea>

                <button id="draftBtn" class="btn-primary" onclick="draftSwarm()" ${isWaiting ? 'disabled' : ''}>
                    ${isWaiting ? '<div class="loader"></div> Decomposing via Gemini 3.1 Pro...' : '✨ Draft Swarm Organization'}
                </button>
            </div>

            <div id="swarms-container">
                <h2 style="margin-bottom: 15px; color: var(--vscode-terminal-ansiCyan);">2. Review & Optimize Worker Contracts</h2>
                ${cardsHtml}
            </div>

            <script>
                const vscode = acquireVsCodeApi();

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
                            readOnlyDirectories: document.getElementById('readonly-' + indexId).value
                        });
                    });

                    vscode.postMessage({ command: 'launch', contracts: contracts });
                }
            </script>
        </body>
        </html>`;
    }
}
