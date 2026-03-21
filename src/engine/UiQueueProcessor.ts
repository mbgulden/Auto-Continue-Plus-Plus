import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentContract, ContractManager } from './ContractManager';
import { HandoffProtocol } from './HandoffProtocol';
import { BudgetManager } from './BudgetManager';

export class UiQueueProcessor {
    constructor(
        private _handoffProtocol: HandoffProtocol,
        private _contractManager: ContractManager,
        private _budgetManager: BudgetManager
    ) {}

    public async processQueue(queue: AgentContract[]): Promise<void> {
        if (queue.length === 0) return;

        const task = queue.shift()!;
        console.log(`[SwarmOrchestrator] Spawning UI task: ${task.threadId}`);

        this._budgetManager.initializeThread(
            task.threadId, 
            task.role, 
            task.targetHead, 
            task.budgetLimit || null, 
            task.localContextMax || 8192
        );

        // Ensure contract is written before spawn
        this._contractManager.createContract(task);
        await this._handoffProtocol.executeSwarmSpawn(task.threadId, task);

        // Path where the contract is stored
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return;
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const contractPath = path.join(workspaceRoot, '.antigravity/contracts', `${task.threadId}.json`);

        // Wait for the UI agent to delete its contract file
        await new Promise<void>((resolve) => {
            if (!fs.existsSync(contractPath)) {
                resolve();
                return;
            }

            let resolved = false;
            let pollInterval: NodeJS.Timeout;

            const watcher = fs.watch(path.dirname(contractPath), (eventType, filename) => {
                if (eventType === 'rename' && filename === `${task.threadId}.json`) {
                    if (!fs.existsSync(contractPath) && !resolved) {
                        resolved = true;
                        watcher.close();
                        clearInterval(pollInterval);
                        resolve();
                    }
                }
            });

            // Fallback polling just in case fs.watch misses the event on some platforms
            pollInterval = setInterval(() => {
                if (!fs.existsSync(contractPath) && !resolved) {
                    resolved = true;
                    clearInterval(pollInterval);
                    watcher.close();
                    resolve();
                }
            }, 2000);
        });

        console.log(`[SwarmOrchestrator] UI task ${task.threadId} completed.`);
        this._budgetManager.resolveThread(task.threadId);

        // Pop the next task in the queue
        if (queue.length > 0) {
            await this.processQueue(queue);
        } else {
            vscode.window.showInformationMessage('Auto-Continue Swarm: All UI queued tasks have been completed.');
        }
    }
}
