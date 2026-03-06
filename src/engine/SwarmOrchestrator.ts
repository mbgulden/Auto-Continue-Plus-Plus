import * as vscode from 'vscode';
import { HandoffProtocol } from './HandoffProtocol';
import { ContractManager, AgentContract } from './ContractManager';
import { SwarmLockManager } from './SwarmLockManager';
import { SWARM_CLI_SCRIPT } from './SwarmCLI';
import * as fs from 'fs';
import * as path from 'path';

export class SwarmOrchestrator {
    private _handoffProtocol: HandoffProtocol;
    private _contractManager: ContractManager;
    private _lockManager: SwarmLockManager;

    constructor(
        handoffProtocol: HandoffProtocol,
        contractManager: ContractManager,
        lockManager: SwarmLockManager
    ) {
        this._handoffProtocol = handoffProtocol;
        this._contractManager = contractManager;
        this._lockManager = lockManager;
    }

    /**
     * Accepts a user's megaprompt and splits it into discrete sub-tasks for the swarm to execute.
     */
    public async spawnDelegates(megaprompt: string): Promise<void> {
        // 1. In a future robust version, we would prompt the active conversation to parse this 
        // string into JSON. For now, we will simulate the "Manager" parsing logic by executing
        // a smart split or asking the user to format it in predefined chunks if needed, 
        // or just splitting it naively if it's bullet points.

        // Ensure the Swarm CLI tool is available for the agents in the workspace
        this._provisionSwarmCLI();

        vscode.window.showInformationMessage('Auto-Continue Swarm: Analyzing Megaprompt and provisioning Workers...');

        // Mocking the Manager LLM parsing for the checkpoint demo.
        // We will treat each newline separated block as a distinct agent task if it starts with "Agent"
        const tasks = this._parseMegaprompt(megaprompt);

        if (tasks.length === 0) {
            vscode.window.showWarningMessage('Auto-Continue Swarm: Could not parse delegates from the prompt. Format should be "Agent [Name]: [Task]"');
            return;
        }

        vscode.window.showInformationMessage(`Auto-Continue Swarm: Provisioning ${tasks.length} Worker Agents concurrently.`);

        for (const task of tasks) {
            // Generate a thread ID for the new worker
            const timestampIdentifier = new Date().toISOString().replace(/[:.]/g, '-') + `-${Math.floor(Math.random() * 1000)}`;

            const contract: AgentContract = {
                threadId: timestampIdentifier,
                role: task.role,
                taskDescription: task.description,
                allowedDirectories: task.allowedDirectories || ['src/'],
                readOnlyDirectories: task.readOnlyDirectories || []
            };

            // Register the hard contract
            this._contractManager.createContract(contract);

            // Command HandoffProtocol to spawn a worker thread bypassing the context overload check
            await this._handoffProtocol.executeSwarmSpawn(contract.threadId, contract);

            // Artificial delay to allow VS Code UI to process the new webview before spawning the next
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        vscode.window.showInformationMessage('Auto-Continue Swarm: All delegates dispatched successfully!');
    }

    /**
     * Naive parser for a megaprompt. In production, this would be an LLM call.
     * Expects format: 
     * Agent Frontend: Update the UI components in src/ui. Paths: src/ui
     * Agent Backend: Update the database schema. Paths: src/db
     */
    private _parseMegaprompt(prompt: string): Array<{ role: string, description: string, allowedDirectories: string[], readOnlyDirectories: string[] }> {
        const lines = prompt.split('\\n');
        const tasks: Array<any> = [];

        for (const line of lines) {
            if (line.trim().startsWith('Agent')) {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const role = parts[0].replace('Agent', '').trim();
                    const description = parts.slice(1).join(':').trim();

                    // Super naive path extractor for demo
                    const pathMatch = description.match(/Paths?:\s*([\\w\\/., ]+)/i);
                    let allowedPaths = ['src/'];
                    if (pathMatch && pathMatch[1]) {
                        allowedPaths = pathMatch[1].split(',').map(p => p.trim());
                    }

                    tasks.push({
                        role,
                        description,
                        allowedDirectories: allowedPaths,
                        readOnlyDirectories: []
                    });
                }
            }
        }

        return tasks;
    }

    /**
     * Deploys the node-based CLI script that agents can use to acquire Mutex locks
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
