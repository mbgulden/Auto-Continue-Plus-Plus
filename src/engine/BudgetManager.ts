import * as vscode from 'vscode';
import { StateManager } from '../state/StateManager';

export interface UsageTelemetry {
    threadId: string;
    agentRole: string;
    targetHead: 'Antigravity UI' | 'Headless API' | 'Local AI';
    cloudTokensUsed: number;
    localContextFilled: number;
    localContextMax: number;
    budgetLimit: number | null;
}

export class BudgetManager {
    private static _instance: BudgetManager;

    // threadId -> UsageTelemetry
    private _telemetry: Map<string, UsageTelemetry> = new Map();

    private _stateManager: StateManager;

    private constructor(stateManager: StateManager) {
        this._stateManager = stateManager;
    }

    public static getInstance(stateManager: StateManager): BudgetManager {
        if (!BudgetManager._instance) {
            BudgetManager._instance = new BudgetManager(stateManager);
        }
        return BudgetManager._instance;
    }

    public initializeThread(
        threadId: string, 
        agentRole: string, 
        targetHead: 'Antigravity UI' | 'Headless API' | 'Local AI', 
        budgetLimit: number | null, 
        localContextMax: number
    ): void {
        const initialTelemetry: UsageTelemetry = {
            threadId,
            agentRole,
            targetHead,
            cloudTokensUsed: 0,
            localContextFilled: 0,
            localContextMax,
            budgetLimit
        };
        this._telemetry.set(threadId, initialTelemetry);
        this._broadcastUpdate();
    }

    public recordCloudUsage(threadId: string, inputTokens: number, outputTokens: number): void {
        const telemetry = this._telemetry.get(threadId);
        if (telemetry && telemetry.targetHead === 'Headless API') {
            telemetry.cloudTokensUsed += (inputTokens + outputTokens);
            this._broadcastUpdate();
        }
    }

    public recordLocalContextAddition(threadId: string, approximateTokens: number): void {
        const telemetry = this._telemetry.get(threadId);
        if (telemetry && telemetry.targetHead === 'Local AI') {
            telemetry.localContextFilled += approximateTokens;
            this._broadcastUpdate();
        }
    }

    public resetLocalContext(threadId: string, baseTokens: number): void {
        const telemetry = this._telemetry.get(threadId);
        if (telemetry && telemetry.targetHead === 'Local AI') {
            telemetry.localContextFilled = baseTokens;
            this._broadcastUpdate();
        }
    }

    public getTelemetry(threadId: string): UsageTelemetry | undefined {
        return this._telemetry.get(threadId);
    }

    public getAllTelemetry(): UsageTelemetry[] {
        return Array.from(this._telemetry.values());
    }

    public checkCloudOverage(threadId: string): boolean {
        const telemetry = this._telemetry.get(threadId);
        if (!telemetry || telemetry.budgetLimit === null || telemetry.targetHead !== 'Headless API') {
            return false;
        }
        return telemetry.cloudTokensUsed >= telemetry.budgetLimit;
    }

    public isLocalContextCritical(threadId: string): boolean {
        const telemetry = this._telemetry.get(threadId);
        if (!telemetry || telemetry.targetHead !== 'Local AI') {
            return false;
        }
        // If we hit 80% capacity of the local model
        return telemetry.localContextFilled >= (telemetry.localContextMax * 0.8);
    }

    public resolveThread(threadId: string): void {
        // We might want to keep the telemetry for a final report instead of immediately deleting
        // but for now, we'll notify and clean up.
        // this._telemetry.delete(threadId);
        this._broadcastUpdate();
    }

    public clearAll(): void {
        this._telemetry.clear();
        this._broadcastUpdate();
    }

    private _broadcastUpdate(): void {
        this._stateManager.updateTelemetry(this.getAllTelemetry());
    }
}
