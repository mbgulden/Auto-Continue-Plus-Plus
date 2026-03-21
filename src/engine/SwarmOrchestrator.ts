import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HandoffProtocol } from './HandoffProtocol';
import { ContractManager, AgentContract } from './ContractManager';
import { SwarmLockManager } from './SwarmLockManager';
import { SWARM_CLI_SCRIPT } from './SwarmCLI';
import { BoltOnRegistry } from '../boltons/BoltOnRegistry';
import { BudgetManager } from './BudgetManager';
import { ZeroTrustValidator } from '../security/ZeroTrustValidator';
import { SwarmPlanner } from './SwarmPlanner';
import { HeadlessExecutor } from './HeadlessExecutor';
import { LocalExecutor } from './LocalExecutor';
import { UiQueueProcessor } from './UiQueueProcessor';

export class SwarmOrchestrator {
    private _contractManager: ContractManager;
    private _budgetManager: BudgetManager;
    private _planner: SwarmPlanner;
    private _headlessExecutor: HeadlessExecutor;
    private _localExecutor: LocalExecutor;
    private _uiProcessor: UiQueueProcessor;

    constructor(
        handoffProtocol: HandoffProtocol,
        contractManager: ContractManager,
        lockManager: SwarmLockManager,  // Kept for signature compatibility for existing instantiation
        boltOnRegistry: BoltOnRegistry,
        budgetManager: BudgetManager,
        zeroTrustValidator?: ZeroTrustValidator
    ) {
        this._contractManager = contractManager;
        this._budgetManager = budgetManager;
        
        // Initialize distinct domain executors
        this._planner = new SwarmPlanner();
        this._headlessExecutor = new HeadlessExecutor(contractManager, boltOnRegistry, budgetManager, zeroTrustValidator);
        this._localExecutor = new LocalExecutor(contractManager, budgetManager);
        this._uiProcessor = new UiQueueProcessor(handoffProtocol, contractManager, budgetManager);
    }

    /**
     * Accepts a user's megaprompt and returns the parsed AgentContracts for UI review.
     */
    public async decomposeMegaprompt(megaprompt: string): Promise<AgentContract[]> {
        return this._planner.decomposeMegaprompt(megaprompt);
    }

    /**
     * Accepts a list of confirmed AgentContracts and routes them to their execution domains.
     */
    public async spawnDelegatesFromContracts(contracts: AgentContract[]): Promise<void> {
        this._provisionSwarmCLI();

        vscode.window.showInformationMessage(`Auto-Continue Swarm: Provisioning ${contracts.length} Worker Agents...`);

        // Segregate by head
        const antigravityQueue = contracts.filter(c => c.targetHead === 'Antigravity UI');
        const headlessSwarm = contracts.filter(c => c.targetHead === 'Headless API');
        const localSwarm = contracts.filter(c => c.targetHead === 'Local AI');

        // 1. Process Headless & Local AI concurrently in the background (fire and forget)
        for (const contract of [...headlessSwarm, ...localSwarm]) {
            this._budgetManager.initializeThread(
                contract.threadId, 
                contract.role, 
                contract.targetHead, 
                contract.budgetLimit || null, 
                contract.localContextMax || 8192
            );

            this._contractManager.createContract(contract);

            if (contract.targetHead === 'Headless API') {
                this._headlessExecutor.execute(contract).catch(e => {
                    console.error(`[Headless API] Error in thread ${contract.threadId}:`, e);
                    vscode.window.showErrorMessage(`[Headless API Error] ${contract.role}: ${e.message}`);
                });
            } else if (contract.targetHead === 'Local AI') {
                this._localExecutor.execute(contract).catch(e => {
                    console.error(`[Local AI] Error in thread ${contract.threadId}:`, e);
                    vscode.window.showErrorMessage(`[Local AI Error] ${contract.role}: ${e.message}`);
                });
            }
        }

        // 2. Queue Antigravity UI tasks sequentially so the sidebar doesn't bleed
        if (antigravityQueue.length > 0) {
            vscode.window.showInformationMessage(`Auto-Continue Swarm: Queued ${antigravityQueue.length} tasks for Antigravity UI.`);
            this._uiProcessor.processQueue(antigravityQueue);
        }

        vscode.window.showInformationMessage('Auto-Continue Swarm: Routing complete.');
    }

    /**
     * Deploys the node-based CLI script that agents can use to acquire Mutex locks.
     */
    private _provisionSwarmCLI(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return;

        const binDir = path.join(workspaceFolders[0].uri.fsPath, '.antigravity');
        if (!fs.existsSync(binDir)) {
            fs.mkdirSync(binDir, { recursive: true });
        }

        const scriptPath = path.join(binDir, 'swarm.js');
        // Always overwrite to ensure it has the latest CLI code
        fs.writeFileSync(scriptPath, SWARM_CLI_SCRIPT, { encoding: 'utf8', mode: 0o755 });
    }
}
