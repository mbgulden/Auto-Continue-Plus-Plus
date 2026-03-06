import * as vscode from 'vscode';
import { StateManager } from '../state/StateManager';
import { ContextTracker, AgentHeartbeat } from '../engine/ContextTracker';
import { LineageManager, LineageMeta, GlobalConversation } from '../engine/LineageManager';

export class DashboardWebview {
    public static currentPanel: DashboardWebview | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, stateManager: StateManager, contextTracker: ContextTracker) {
        this._panel = panel;
        this._update(stateManager, contextTracker);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(stateManager: StateManager, contextTracker: ContextTracker) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (DashboardWebview.currentPanel) {
            DashboardWebview.currentPanel._panel.reveal(column);
            DashboardWebview.currentPanel._update(stateManager, contextTracker);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'autoContinueDashboard',
            'Agent Manager',
            column || vscode.ViewColumn.One,
            { enableScripts: true }
        );

        DashboardWebview.currentPanel = new DashboardWebview(panel, stateManager, contextTracker);

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'clearLineage':
                        LineageManager.clearLineageHistory();
                        DashboardWebview.currentPanel?._update(stateManager, contextTracker);
                        return;
                    case 'openThread':
                        LineageManager.openThreadFile(message.id);
                        return;
                    case 'openWorkspace':
                        const uri = vscode.Uri.file(message.path);
                        vscode.commands.executeCommand('vscode.openFolder', uri, true);
                        return;
                    case 'openBrainFolder':
                        LineageManager.openBrainFolder(message.id);
                        return;
                }
            },
            null,
            DashboardWebview.currentPanel._disposables
        );
    }

    public _update(stateManager: StateManager, contextTracker: ContextTracker) {
        const health = Math.round(contextTracker.getHealthPercentage() * 100);
        const stats = stateManager.getStats();

        // Fetch new global agent lists
        const activeSessions = LineageManager.getActiveSessions();
        const globalConversations = LineageManager.getGlobalConversations();

        // Grab new token metrics for the local session only
        const burnRate = contextTracker.getBurnRate();
        const cost = contextTracker.getEstimatedCost();
        const historyData = contextTracker.getTokenHistory();

        this._panel.title = "Agent Manager";
        this._panel.webview.html = this._getHtmlForWebview(health, stats, activeSessions, globalConversations, burnRate, cost, historyData);
    }

    public dispose() {
        DashboardWebview.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _generateActiveSessionsHtml(sessions: AgentHeartbeat[], localHealth: number): string {
        if (sessions.length === 0) {
            return `<div class="node-child"><p><i>No active peer agents detected.</i></p></div>`;
        }

        let html = '';
        sessions.forEach(session => {
            const isLocal = session.workspacePath === (vscode.workspace.workspaceFolders?.[0].uri.fsPath || '');

            // If it's the exact same workspace as this one, use the local context tracker's up to the millisecond health
            const healthVal = isLocal ? localHealth : session.healthPct;

            // Check if it's actually alive (updated within last 30s)
            const timeDiff = Date.now() - session.timestamp;
            const isAlive = timeDiff < 30000;

            const dotColor = isAlive ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-disabledForeground)';
            const barColor = healthVal >= 90 ? 'red' : (healthVal >= 75 ? 'orange' : 'green');
            const statusText = isAlive ? 'Online' : 'Idle / Offline';

            html += `
            <div class="node-child" style="border-left: 2px solid ${barColor}; padding: 10px; margin-top: 5px; background: rgba(0,0,0,0.1); border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <p style="margin: 0;">
                        <span style="color: ${dotColor}; font-size: 1.2em;">●</span> 
                        📁 <a href="#" class="thread-link" onclick="openWorkspace('${session.workspacePath.replace(/\\/g, '\\\\')}')" title="Open this Workspace in a new Window"><b>${session.workspaceName}</b></a>
                        ${isLocal ? `<span style="font-size: 0.8em; opacity: 0.6; margin-left: 5px;">(Current)</span>` : ''}
                    </p>
                    <span style="font-size: 0.8em; opacity: 0.8;">${statusText}</span>
                </div>
                
                <div class="bar-container" style="margin-top: 8px; height: 6px; margin-bottom: 5px; background: var(--vscode-editor-background);">
                    <div class="bar" style="width: ${healthVal}%; background-color: ${barColor};"></div>
                </div>
                <div style="text-align: right; font-size: 0.8em; color: ${barColor}; font-weight: bold; margin-top: 2px;">
                    Msg/Ctx: ${healthVal}%
                </div>
            </div>
            `;
        });

        return html;
    }

    private _generateGlobalConversationsHtml(conversations: GlobalConversation[]): string {
        const activeOrNeedsInput = conversations.filter(c => c.status !== 'Completed');
        const completed = conversations.filter(c => c.status === 'Completed');

        let html = '';

        // Active AI Assignments Section
        html += `<div class="card" style="border-top: 3px solid var(--vscode-terminal-ansiYellow);">
            <h2 style="margin-top: 0;">⚡ Active AI Assignments</h2>
            <p style="font-size: 0.9em; opacity: 0.8; margin-bottom: 15px;">A 10,000 ft view over all global Antigravity brain activity. Click an assignment to instantly jump into its tracking folder.</p>`;

        if (activeOrNeedsInput.length === 0) {
            html += `<div class="node-child"><p><i>No active or pending assignments found.</i></p></div>`;
        } else {
            html += `<div id="active-assignments-list">`;
            activeOrNeedsInput.forEach((conv, index) => {
                const isHidden = index >= 5 ? 'display: none;' : '';
                const hideClass = index >= 5 ? 'hidden-active-thread' : 'visible-active-thread';

                let statusColor = 'var(--vscode-terminal-ansiYellow)';
                let idleWarning = '';

                if (conv.status === 'In Progress') {
                    statusColor = 'var(--vscode-terminal-ansiBlue)';
                    if (conv.idleMins > 10) {
                        idleWarning = `<span style="color: var(--vscode-terminal-ansiYellow); font-size: 0.8em;">⚠️ Idle ${conv.idleMins}m</span>`;
                    } else {
                        idleWarning = `<span style="color: var(--vscode-terminal-ansiGreen); font-size: 0.8em;">⚡ Active now</span>`;
                    }
                } else if (conv.status === 'Needs Input') {
                    statusColor = 'var(--vscode-terminal-ansiMagenta)';
                    idleWarning = `<span style="color: var(--vscode-terminal-ansiMagenta); font-size: 0.8em;">Waiting on UX...</span>`;
                }

                html += `
                <div class="node-child ${hideClass}" style="${isHidden} border-left: 2px solid ${statusColor}; padding: 12px; margin-top: 8px; margin-bottom: 8px; background: rgba(0,0,0,0.1); border-radius: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="flex-grow: 1; padding-right: 15px;">
                            <p style="margin: 0; line-height: 1.4; font-size: 1.05em;">
                                💬 <a href="#" class="thread-link" onclick="openBrainFolder('${conv.id}')" title="Click to reveal Antigravity Brain folder"><b>${conv.title}</b></a>
                            </p>
                            <p style="margin: 4px 0 0 0; font-size: 0.75em; opacity: 0.6; font-family: monospace;">ID: ${conv.id}</p>
                        </div>
                        <div style="text-align: right; white-space: nowrap;">
                            ${idleWarning}
                        </div>
                    </div>
                    
                    <div style="margin-top: 10px; display: flex; align-items: center; justify-content: space-between;">
                         <span style="font-size: 0.8em; font-weight: bold; color: ${statusColor}; width: 80px;">${conv.status}</span>
                         <div class="bar-container" style="flex-grow: 1; height: 6px; margin: 0 10px; background: var(--vscode-editor-background);">
                             <div class="bar" style="width: ${conv.progressPct}%; background-color: ${statusColor}; border-radius: 10px;"></div>
                         </div>
                         <span style="font-size: 0.8em; opacity: 0.8; width: 40px; text-align: right;">${conv.progressPct}%</span>
                    </div>
                </div>
                `;
            });
            html += `</div>`;

            if (activeOrNeedsInput.length > 5) {
                html += `
                <button id="toggle-active-btn" class="btn-clear" style="margin-top: 15px; width: 100%; background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border);" onclick="toggleActiveThreads()">
                    ▼ Show all ${activeOrNeedsInput.length} Active Assignments
                </button>
                `;
            }
        }
        html += `</div>`; // Close card


        // Completed Archive Section
        html += `<div class="card" style="border-top: 3px solid var(--vscode-terminal-ansiGreen);">
            <h2 style="margin-top: 0;">📚 Completed Archive</h2>
            <p style="font-size: 0.9em; opacity: 0.8; margin-bottom: 15px;">Global history of successfully resolved conversation intents.</p>`;

        if (completed.length === 0) {
            html += `<div class="node-child" style="padding-left: 15px; margin-top: 10px;">
                        <p><i>No completed global conversations found.</i></p>
                    </div>`;
        } else {
            html += `<div id="completed-assignments-list">`;
            completed.forEach((conv, index) => {
                const isHidden = index >= 5 ? 'display: none;' : '';
                const hideClass = index >= 5 ? 'hidden-completed-thread' : 'visible-completed-thread';

                html += `
                <div class="node-child ${hideClass}" style="${isHidden} border-left: 2px solid var(--vscode-widget-border); padding-left: 15px; margin-top: 8px; margin-bottom: 8px;">
                    <p style="margin: 0; line-height: 1.8;">
                        ↳ 🌱 💬 <a href="#" class="thread-link" onclick="openBrainFolder('${conv.id}')" title="Click to reveal Antigravity Brain folder"><b>${conv.title}</b></a>
                    </p>
                    <div style="display: flex; justify-content: space-between; font-size: 0.80em; opacity: 0.7; margin-top: 2px;">
                        <span>Last Active: ${new Date(conv.lastModifiedMs).toLocaleString()}</span>
                        <span style="color: var(--vscode-terminal-ansiGreen);">✓ Walkthrough Generated</span>
                    </div>
                </div>
                `;
            });
            html += `</div>`;

            if (completed.length > 5) {
                html += `
                <button id="toggle-completed-btn" class="btn-clear" style="margin-top: 15px; width: 100%; background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border);" onclick="toggleCompletedThreads()">
                    ▼ Show all ${completed.length} Completed Projects
                </button>
                `;
            }
        }

        html += `<div style="border-top: 1px dashed var(--vscode-editorGroup-border); padding-top: 15px; margin-top: 20px;">
                <button class="btn-clear" onclick="clearLineage()">Clear Native Lineage Data</button>
            </div>
        </div>`; // Close card

        return html;
    }

    private _generateSvgSparkline(data: { timestamp: number, tokens: number }[]): string {
        if (data.length < 2) return `<div class="chart-empty">Not enough data to graph yet...</div>`;

        const width = 450;
        const height = 100;
        const padding = 10;

        const maxTokens = Math.max(...data.map(d => d.tokens));
        const minTime = data[0].timestamp;
        const maxTime = data[data.length - 1].timestamp;

        const timeRange = maxTime - minTime || 1;
        const tokenRange = maxTokens || 1;

        let pathD = `M ${padding} ${height - padding}`; // Start at bottom left

        data.forEach((point, i) => {
            const x = padding + ((point.timestamp - minTime) / timeRange) * (width - 2 * padding);
            const y = height - padding - ((point.tokens / tokenRange) * (height - 2 * padding));

            if (i === 0) {
                pathD = `M ${x} ${y}`;
            } else {
                pathD += ` L ${x} ${y}`;
            }
        });

        return `
        <svg viewBox="0 0 ${width} ${height}" class="sparkline" preserveAspectRatio="none">
            <polyline fill="none" stroke="var(--vscode-terminal-ansiCyan)" stroke-width="2" points="${pathD.substring(2)}" />
            <!-- Fill area -->
            <path d="${pathD} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z" fill="var(--vscode-terminal-ansiCyan)" opacity="0.1" />
        </svg>
        <div style="display: flex; justify-content: space-between; font-size: 0.75em; opacity: 0.6; margin-top: 5px;">
            <span>${new Date(minTime).toLocaleTimeString()}</span>
            <span>Now</span>
        </div>
        `;
    }

    private _getHtmlForWebview(health: number, stats: any, activeSessions: AgentHeartbeat[], globalConversations: GlobalConversation[], burnRate: number, cost: string, historyData: { timestamp: number, tokens: number }[]) {
        const liveWorkspacesHtml = this._generateActiveSessionsHtml(activeSessions, health);
        const globalConversationsHtml = this._generateGlobalConversationsHtml(globalConversations);
        const sparklineSvg = this._generateSvgSparkline(historyData);

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Power User Agent Manager</title>
                <style>
                    body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); }
                    .card { background: var(--vscode-editorWidget-background); padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--vscode-widget-border); box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    .bar-container { width: 100%; background: var(--vscode-progressBar-background); border-radius: 10px; overflow: hidden; }
                    .bar { height: 100%; transition: width 0.3s; }
                    .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                    .stat-box { background: var(--vscode-editor-background); padding: 10px; text-align: center; border-radius: 4px; border: 1px solid var(--vscode-editorGroup-border); }
                    .node { border-left: 2px solid var(--vscode-widget-border); padding-left: 15px; margin-top: 10px;}
                    .btn-clear { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 5px 10px; cursor: pointer; border-radius: 2px; font-size: 0.85em; margin-top: 10px; transition: background 0.2s;}
                    .btn-clear:hover { background: var(--vscode-button-hoverBackground); }
                    .thread-link { color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer; }
                    .thread-link:hover { text-decoration: underline; color: var(--vscode-textLink-activeForeground); }
                    .sparkline { width: 100%; height: 100px; display: block; border-bottom: 1px dashed var(--vscode-editorGroup-border); }
                    .chart-empty { height: 100px; display: flex; align-items: center; justify-content: center; opacity: 0.5; font-style: italic; border-bottom: 1px dashed var(--vscode-editorGroup-border); }
                </style>
            </head>
            <body>
                <h1>Agent Manager <span style="font-size: 0.5em; opacity: 0.5; vertical-align: super;">PRO</span></h1>
                
                <div class="card" style="border-top: 3px solid var(--vscode-terminal-ansiCyan);">
                    <h2 style="margin-top: 0;">🟢 Live Agent Fleet (Local Ext)</h2>
                    <p style="font-size: 0.9em; opacity: 0.8; margin-bottom: 15px;">Monitoring active contextual bounds across all VS Code sessions. Resolving Lineage Branches up to the millisecond.</p>
                    
                    ${liveWorkspacesHtml}
                </div>

                ${globalConversationsHtml}

                <div class="card">
                    <h2>Current Sandbox Metrics</h2>
                    <div class="stats-grid" style="margin-bottom: 15px; margin-top: 15px;">
                        <div class="stat-box" style="border-color: var(--vscode-terminal-ansiCyan);">
                            <h3 style="color: var(--vscode-terminal-ansiCyan); margin: 5px 0;">🔥 ${burnRate} t/min</h3>
                            <p style="margin: 0; font-size: 0.9em; opacity: 0.8;">Action Burn Rate</p>
                        </div>
                        <div class="stat-box" style="border-color: var(--vscode-terminal-ansiGreen);">
                            <h3 style="color: var(--vscode-terminal-ansiGreen); margin: 5px 0;">💰 ${cost}</h3>
                            <p style="margin: 0; font-size: 0.9em; opacity: 0.8;">Est. Thread Cost</p>
                        </div>
                    </div>
                    
                    <p style="font-size: 0.85em; margin-bottom: 5px;">Token Growth (Last 15m)</p>
                    ${sparklineSvg}
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function clearLineage() {
                        vscode.postMessage({ command: 'clearLineage' });
                    }
                    
                    function openThread(id) {
                        vscode.postMessage({ command: 'openThread', id: id });
                    }
                    
                    function openWorkspace(fsPath) {
                        vscode.postMessage({ command: 'openWorkspace', path: fsPath });
                    }
                    
                    function openBrainFolder(id) {
                        vscode.postMessage({ command: 'openBrainFolder', id: id });
                    }
                    
                    let isActiveExpanded = false;
                    function toggleActiveThreads() {
                        const threads = document.querySelectorAll('.hidden-active-thread');
                        const btn = document.getElementById('toggle-active-btn');
                        
                        isActiveExpanded = !isActiveExpanded;
                        
                        threads.forEach(t => {
                            t.style.display = isActiveExpanded ? 'block' : 'none';
                        });
                        
                        if (isActiveExpanded) {
                            btn.innerText = "▲ Show less";
                        } else {
                            btn.innerText = "▼ Show all " + (threads.length + 5) + " Active Assignments";
                        }
                    }

                    let isCompletedExpanded = false;
                    function toggleCompletedThreads() {
                        const threads = document.querySelectorAll('.hidden-completed-thread');
                        const btn = document.getElementById('toggle-completed-btn');
                        
                        isCompletedExpanded = !isCompletedExpanded;
                        
                        threads.forEach(t => {
                            t.style.display = isCompletedExpanded ? 'block' : 'none';
                        });
                        
                        if (isCompletedExpanded) {
                            btn.innerText = "▲ Show less";
                        } else {
                            btn.innerText = "▼ Show all " + (threads.length + 5) + " Completed Projects";
                        }
                    }
                    
                    // Auto-refresh the dashboard every 10 seconds to keep the burn rate graph and heartbeat live
                    setInterval(() => {
                        // In VS Code, dashboards usually require backend messages to repaint natively.
                        // For Auto-Continue, real changes are pushed by the ContextTracker event,
                        // this just serves as a general reminder comment for full architecture bindings.
                    }, 10000);
                </script>
            </body>
            </html>`;
    }
}
