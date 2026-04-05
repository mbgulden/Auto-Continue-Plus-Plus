import * as vscode from 'vscode';
import WebSocket = require('ws');
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

export interface CDPTrafficEvent {
    type: 'click' | 'block' | 'reload' | 'heartbeat_fail';
    message: string;
}


const BASE_PORT = 9000;
const PORT_RANGE = 3; // 9000 +/- 3

export class CDPHandler {
    private _connections = new Map<string, { ws: WebSocket, injected: boolean }>();
    private _isEnabled = false;
    private _msgId = 1;

    // We cache the js payload to avoid disk I/O on every page load
    private _autoAcceptScript: string | null = null;

    constructor() { }

    private _getAutoAcceptScript(context: vscode.ExtensionContext): string {
        if (this._autoAcceptScript) return this._autoAcceptScript;

        const scriptPath = path.join(context.extensionPath, 'dist', 'src', 'engine', 'inject', 'auto_accept.js');
        const fallbackPath = path.join(context.extensionPath, 'src', 'engine', 'inject', 'auto_accept.js');

        try {
            if (fs.existsSync(scriptPath)) {
                this._autoAcceptScript = fs.readFileSync(scriptPath, 'utf8');
            } else if (fs.existsSync(fallbackPath)) {
                this._autoAcceptScript = fs.readFileSync(fallbackPath, 'utf8');
            } else {
                throw new Error("Cannot find auto_accept.js payload.");
            }
        } catch (e) {
            console.error("[Auto-Continue] Failed to load auto_accept.js payload: ", e);
            throw e;
        }

        return this._autoAcceptScript;
    }

    /**
     * Checks if CDP is reachable
     */
    public async isCDPAvailable(): Promise<boolean> {
        const hosts = ['127.0.0.1', 'localhost', '::1'];
        for (let port = BASE_PORT - PORT_RANGE; port <= BASE_PORT + PORT_RANGE; port++) {
            for (const host of hosts) {
                try {
                    const pages = await this._getPages(port, host);
                    if (pages.length > 0) return true;
                } catch (e) { }
            }
        }
        return false;
    }

    /**
     * Scans for open WebViews and injects the handler
     */
    public async start(context: vscode.ExtensionContext): Promise<void> {
        this._isEnabled = true;
        const hosts = ['127.0.0.1', 'localhost', '::1'];

        for (let port = BASE_PORT - PORT_RANGE; port <= BASE_PORT + PORT_RANGE; port++) {
            for (const host of hosts) {
                try {
                    const pages = await this._getPages(port, host);
                    for (const page of pages) {
                        const id = `${port}:${page.id}`;
                        if (!this._connections.has(id)) {
                            // Convert standard host string for WebSocket URL formatting
                            const wsUrl = page.webSocketDebuggerUrl;
                            await this._connect(id, wsUrl);
                        }
                        await this._inject(id, context);
                    }
                    if (pages.length > 0) break; // If we found pages on this host, don't keep polling other hosts for this port
                } catch (e) {
                    // Ignore port scanning errors
                }
            }
        }
    }

    public async stop(): Promise<void> {
        this._isEnabled = false;
        for (const [id, conn] of this._connections) {
            try {
                await this._evaluate(id, 'if(window.__autoAcceptStop) window.__autoAcceptStop()');
                conn.ws.close();
            } catch (e) { }
        }
        this._connections.clear();
    }

    /**
     * Executes a script across all currently connected CDP injection targets.
     * Useful for broadcasting events like triggering submit button clicks.
     */
    public async executeGlobalScript(script: string): Promise<void> {
        if (!this._isEnabled) return;
        const promises: Promise<any>[] = [];
        for (const [id, conn] of this._connections) {
            promises.push(this._evaluate(id, script).catch(e => {
                console.log(`[Auto-Continue CDP] Global script fail on ${id}:`, e);
            }));
        }
        await Promise.all(promises);
    }

    private async _getPages(port: number, host: string = '127.0.0.1'): Promise<any[]> {
        return new Promise((resolve) => {
            const req = http.get({ hostname: host, port, path: '/json/list', timeout: 500 }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const pages = JSON.parse(body);
                        const filtered = pages.filter((p: any) => {
                            if (!p.webSocketDebuggerUrl) return false;
                            if (p.type !== 'page' && p.type !== 'webview') return false;
                            const url = (p.url || '').toLowerCase();
                            // Do not inject into DevTools itself
                            if (url.startsWith('devtools://') || url.startsWith('chrome-devtools://')) return false;
                            return true;
                        });
                        resolve(filtered);
                    } catch (e) { resolve([]); }
                });
            });
            req.on('error', () => resolve([]));
            req.on('timeout', () => { req.destroy(); resolve([]); });
        });
    }

    private async _connect(id: string, url: string): Promise<boolean> {
        return new Promise((resolve) => {
            const ws = new WebSocket(url);
            
            // Heartbeat
            let isAlive = true;
            const heartbeatInterval = setInterval(() => {
                if (ws.readyState !== WebSocket.OPEN) return;
                if (!isAlive) {
                    ws.terminate();
                    return;
                }
                isAlive = false;
                ws.ping();
            }, 5000);

            ws.on('pong', () => { isAlive = true; });

            ws.on('open', () => {
                this._connections.set(id, { ws, injected: false });
                console.log(`[Auto-Continue CDP] Connected to page ${id}`);
                resolve(true);
            });
            ws.on('error', () => {
                clearInterval(heartbeatInterval);
                resolve(false);
            });
            ws.on('close', () => {
                clearInterval(heartbeatInterval);
                this._connections.delete(id);
                console.log(`[Auto-Continue CDP] Connection closed for ${id}`);
            });
        });
    }

    private async _inject(id: string, context: vscode.ExtensionContext): Promise<void> {
        const conn = this._connections.get(id);
        if (!conn) return;

        try {
            if (!conn.injected) {
                const script = this._getAutoAcceptScript(context);
                
                // We no longer inject fetch directly in the payload;
                // telemetry is handled securely by the PollingEngine via Node.js
                await this._evaluate(id, script);
                conn.injected = true;

                // Configure internal auto accept runtime execution
                const configJson = JSON.stringify({
                    ide: 'antigravity',
                    isBackgroundMode: false,
                    pollInterval: 1000,
                    bannedCommands: []
                });
                await this._evaluate(id, `if(window.__autoAcceptStart) window.__autoAcceptStart(${configJson})`);
            }
        } catch (e) {
            console.log(`[Auto-Continue CDP] Injection failed for ${id}:`, e);
        }
    }

    private async _evaluate(id: string, expression: string): Promise<any> {
        const conn = this._connections.get(id);
        if (!conn || conn.ws.readyState !== WebSocket.OPEN) return undefined;

        return new Promise((resolve, reject) => {
            const currentId = this._msgId++;
            const timeout = setTimeout(() => reject(new Error('CDP Timeout')), 2000);

            const onMessage = (data: WebSocket.Data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.id === currentId) {
                        conn.ws.off('message', onMessage);
                        clearTimeout(timeout);
                        resolve(msg.result);
                    }
                } catch (e) { }
            };

            conn.ws.on('message', onMessage);
            conn.ws.send(JSON.stringify({
                id: currentId,
                method: 'Runtime.evaluate',
                params: { expression, userGesture: true, awaitPromise: true }
            }));
        });
    }
}
