import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { StateManager } from '../state/StateManager';
import { get_encoding, Tiktoken } from 'tiktoken';

export interface BudgetProjection {
    mode: 'googleOneSubscription' | 'payAsYouGoAPI';
    isEarlyDepletion: boolean;
    timeRemainingMs: number | null; // Null if not depleting early
    metricValue: number; // Tokens or USD spent
    metricLimit: number; // Token limit or USD limit
    refreshTimeMs: number; // When the window resets
}

export interface AgentHeartbeat {
    workspaceName: string;
    workspacePath: string;
    healthPct: number;
    timestamp: number;
}

export class ContextTracker {
    private _stateManager: StateManager;
    private _currentTokenCount: number = 0;
    private _tokenLimit: number = 120000; // The threshold limit before we trigger Handoff

    // Billing Config
    private _costPerMillion: number = 3.0;
    private _billingMode: 'googleOneSubscription' | 'payAsYouGoAPI' = 'googleOneSubscription';
    private _refreshHours: number = 5;
    private _subTokenLimit: number = 2000000;
    private _apiDailyBudget: number = 5.0;

    private _tokenizer: Tiktoken | null = null;
    private _disposables: vscode.Disposable[] = [];

    private _onDidChangeHealth = new vscode.EventEmitter<number>();
    public readonly onDidChangeHealth = this._onDidChangeHealth.event;

    // Burn Rate Tracking
    private _sessionStartTime: number = Date.now();
    private _tokenHistory: { timestamp: number, tokens: number }[] = [];

    // Heartbeat Tracking
    private _heartbeatTimer: NodeJS.Timeout | null = null;
    private _workspaceName: string = "Unknown Workspace";
    private _workspacePath: string = "";

    // Stability Tracking
    private _lastTokenIncreaseTime: number = Date.now();

    constructor(stateManager: StateManager) {
        this._stateManager = stateManager;

        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this._workspaceName = vscode.workspace.workspaceFolders[0].name;
            this._workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }

        try {
            // We use cl100k_base which is standard for GPT-4/Claude 3 token estimations
            this._tokenizer = get_encoding("cl100k_base");
        } catch (e) {
            console.error('[ContextTracker] Failed to initialize tiktoken:', e);
        }

        this.loadConfig();
        this._tokenHistory.push({ timestamp: Date.now(), tokens: 0 });

        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('autoContinue.maxTokenLimit') ||
                    e.affectsConfiguration('autoContinue.apiCostPerMillionTokens') ||
                    e.affectsConfiguration('autoContinue.billingMode') ||
                    e.affectsConfiguration('autoContinue.subscriptionRefreshHours') ||
                    e.affectsConfiguration('autoContinue.subscriptionTokenLimit') ||
                    e.affectsConfiguration('autoContinue.apiDailyBudget')) {
                    this.loadConfig();
                }
            })
        );

        // TRUE REAL DATA INTEGRATION:
        this._disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                if (this._stateManager.isActive && e.document.uri.scheme === 'file') {
                    if (e.document.fileName.includes('.handoff_summary')) return;

                    for (const change of e.contentChanges) {
                        if (change.text.length > 0) {
                            this.registerTokensFromText(change.text);
                        }
                    }
                }
            })
        );

        // Start background heartbeat
        this._startHeartbeat();
    }

    private loadConfig() {
        const config = vscode.workspace.getConfiguration('autoContinue');
        this._tokenLimit = config.get<number>('maxTokenLimit', 120000);
        this._costPerMillion = config.get<number>('apiCostPerMillionTokens', 3.0);
        this._billingMode = config.get<'googleOneSubscription' | 'payAsYouGoAPI'>('billingMode', 'googleOneSubscription');
        this._refreshHours = config.get<number>('subscriptionRefreshHours', 5);
        this._subTokenLimit = config.get<number>('subscriptionTokenLimit', 2000000);
        this._apiDailyBudget = config.get<number>('apiDailyBudget', 5.0);
    }

    private _writeHeartbeat() {
        if (!this._stateManager.isActive || !this._workspacePath) return;

        try {
            const homeDir = process.env.USERPROFILE || process.env.HOME || '';
            const sessionsDir = path.join(homeDir, '.gemini', 'antigravity', 'active_sessions');

            if (!fs.existsSync(sessionsDir)) {
                fs.mkdirSync(sessionsDir, { recursive: true });
            }

            const hash = crypto.createHash('md5').update(this._workspacePath).digest('hex');
            const sessionPath = path.join(sessionsDir, `${hash}.json`);

            const heartbeat: AgentHeartbeat = {
                workspaceName: this._workspaceName,
                workspacePath: this._workspacePath,
                healthPct: Math.round(this.getHealthPercentage() * 100),
                timestamp: Date.now()
            };

            fs.writeFileSync(sessionPath, JSON.stringify(heartbeat, null, 2), 'utf8');
        } catch (e) {
            console.error('[ContextTracker] Error writing session heartbeat:', e);
        }
    }

    private _startHeartbeat() {
        // Write immediately then every 5 seconds
        this._writeHeartbeat();
        this._heartbeatTimer = setInterval(() => {
            if (this._stateManager.isActive) {
                this._writeHeartbeat();
            }
        }, 5000);
    }

    /**
     * Parses a string of text and adds its precise token count to the tracker.
     */
    public registerTokensFromText(text: string): void {
        const MAX_SYNC_CHARS = 50000;
        let addedTokens = 0;

        if (!this._tokenizer) {
            addedTokens = Math.ceil(text.length / 4);
        } else {
            try {
                if (text.length > MAX_SYNC_CHARS) {
                    const safeChunk = text.substring(0, MAX_SYNC_CHARS);
                    const exactTokens = this._tokenizer.encode(safeChunk);
                    const remainingChars = text.length - MAX_SYNC_CHARS;
                    const estimatedTokens = Math.ceil(remainingChars / 4);
                    addedTokens = exactTokens.length + estimatedTokens;
                } else {
                    const tokens = this._tokenizer.encode(text);
                    addedTokens = tokens.length;
                }
            } catch (e) {
                console.error('[ContextTracker] Token encoding error:', e);
                addedTokens = Math.ceil(text.length / 4);
            }
        }

        this._currentTokenCount += addedTokens;

        if (addedTokens > 0) {
            this._lastTokenIncreaseTime = Date.now();
        }

        // Push the new tokens into StateManager for long-term budget tracking
        const refreshWindowHours = this._billingMode === 'googleOneSubscription' ? this._refreshHours : 24;
        this._stateManager.updateBudgetTokens(addedTokens, refreshWindowHours);

        this._tokenHistory.push({ timestamp: Date.now(), tokens: this._currentTokenCount });
        const fifteenMinsAgo = Date.now() - (15 * 60 * 1000);
        this._tokenHistory = this._tokenHistory.filter(pt => pt.timestamp > fifteenMinsAgo);

        this._onDidChangeHealth.fire(this.getHealthPercentage());
        this._writeHeartbeat();
    }

    /**
     * Helper to manually add estimated token amounts
     */
    public addEstimatedTokens(amount: number): void {
        this._currentTokenCount += amount;

        if (amount > 0) {
            this._lastTokenIncreaseTime = Date.now();
        }

        const refreshWindowHours = this._billingMode === 'googleOneSubscription' ? this._refreshHours : 24;
        this._stateManager.updateBudgetTokens(amount, refreshWindowHours);

        this._tokenHistory.push({ timestamp: Date.now(), tokens: this._currentTokenCount });

        this._onDidChangeHealth.fire(this.getHealthPercentage());
        this._writeHeartbeat();
    }

    public getHealthPercentage(): number {
        const percentage = this._currentTokenCount / this._tokenLimit;
        return Math.min(percentage, 1.0);
    }

    public isStable(): boolean {
        // Return true if no tokens have been added in the last 10 seconds
        return (Date.now() - this._lastTokenIncreaseTime) > 10000;
    }

    public isOverloaded(): boolean {
        return this.getHealthPercentage() >= 0.90;
    }

    public getBurnRate(): number {
        const fiveMinsAgo = Date.now() - (5 * 60 * 1000);
        const dataPoints = this._tokenHistory.filter(pt => pt.timestamp >= fiveMinsAgo);

        if (dataPoints.length < 2) return 0;
        const startTokens = dataPoints[0].tokens;
        const endTokens = dataPoints[dataPoints.length - 1].tokens;
        const deltaTokens = endTokens - startTokens;
        if (deltaTokens <= 0) return 0;

        const timeSpanMs = dataPoints[dataPoints.length - 1].timestamp - dataPoints[0].timestamp;
        const timeSpanMins = timeSpanMs / 1000 / 60;
        if (timeSpanMins === 0) return 0;

        return Math.round(deltaTokens / timeSpanMins);
    }

    public getBudgetProjection(): BudgetProjection {
        const stats = this._stateManager.getStats();
        const now = Date.now();
        const burnRateTpm = this.getBurnRate();

        const refreshHours = this._billingMode === 'googleOneSubscription' ? this._refreshHours : 24;
        const refreshMs = refreshHours * 60 * 60 * 1000;
        const refreshTimeMs = stats.budgetWindowStart + refreshMs;
        const msUntilRefresh = Math.max(0, refreshTimeMs - now);
        const minsUntilRefresh = msUntilRefresh / 60000;

        let isEarlyDepletion = false;
        let timeRemainingMs: number | null = null;
        let metricValue = 0;
        let metricLimit = 1;

        if (this._billingMode === 'googleOneSubscription') {
            metricValue = stats.budgetCumulativeTokens;
            metricLimit = this._subTokenLimit;
            const tokensRemaining = Math.max(0, metricLimit - metricValue);

            if (burnRateTpm > 0 && tokensRemaining > 0) {
                const minsToDepletion = tokensRemaining / burnRateTpm;
                if (minsToDepletion < minsUntilRefresh) {
                    isEarlyDepletion = true;
                    timeRemainingMs = minsToDepletion * 60000;
                }
            } else if (tokensRemaining <= 0) {
                isEarlyDepletion = true;
                timeRemainingMs = 0;
            }
        } else {
            const spentDollars = (stats.budgetCumulativeTokens / 1000000) * this._costPerMillion;
            metricValue = spentDollars;
            metricLimit = this._apiDailyBudget;
            const dollarsRemaining = Math.max(0, metricLimit - spentDollars);
            const burnRateDpm = (burnRateTpm / 1000000) * this._costPerMillion;

            if (burnRateDpm > 0 && dollarsRemaining > 0) {
                const minsToDepletion = dollarsRemaining / burnRateDpm;
                if (minsToDepletion < minsUntilRefresh) {
                    isEarlyDepletion = true;
                    timeRemainingMs = minsToDepletion * 60000;
                }
            } else if (dollarsRemaining <= 0) {
                isEarlyDepletion = true;
                timeRemainingMs = 0;
            }
        }

        return {
            mode: this._billingMode,
            isEarlyDepletion,
            timeRemainingMs,
            metricValue,
            metricLimit,
            refreshTimeMs
        };
    }

    public getEstimatedCost(): string {
        const cost = (this._currentTokenCount / 1000000) * this._costPerMillion;
        return "$" + cost.toFixed(3);
    }

    public getTokenHistory(): { timestamp: number, tokens: number }[] {
        return this._tokenHistory;
    }

    public resetContext(): void {
        this._currentTokenCount = 0;
        this._sessionStartTime = Date.now();
        this._tokenHistory = [{ timestamp: Date.now(), tokens: 0 }];
        console.log('[ContextTracker] Session context reset.');

        this._onDidChangeHealth.fire(this.getHealthPercentage());
        this._writeHeartbeat();
    }

    public dispose(): void {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
        this._onDidChangeHealth.dispose();
        if (this._tokenizer) {
            this._tokenizer.free();
        }
        for (const d of this._disposables) {
            d.dispose();
        }
    }
}
