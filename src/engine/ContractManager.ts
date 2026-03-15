import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface AgentContract {
    threadId: string;
    role: string;
    taskDescription: string;
    allowedDirectories: string[];
    readOnlyDirectories: string[];
    targetHead: 'Antigravity UI' | 'Headless API' | 'Local AI';
    maxTokens?: number;
}

/**
 * Handles the creation, retrieval, and enforcement prompts for Agent Contracts.
 * Contracts define the strict boundaries for a Worker Agent in the Swarm.
 */
export class ContractManager {
    private readonly CONTRACTS_DIR = '.antigravity/contracts';
    private _workspaceRoot: string | undefined;

    constructor() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this._workspaceRoot = workspaceFolders[0].uri.fsPath;
            this._ensureContractsDirExists();
        }
    }

    private _getContractsDirPath(): string | null {
        if (!this._workspaceRoot) return null;
        return path.join(this._workspaceRoot, this.CONTRACTS_DIR);
    }

    private _ensureContractsDirExists(): void {
        const dir = this._getContractsDirPath();
        if (!dir) return;

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Writes a new contract for a worker agent.
     */
    public createContract(contract: AgentContract): void {
        const dir = this._getContractsDirPath();
        if (!dir) return;

        const contractPath = path.join(dir, `${contract.threadId}.json`);
        fs.writeFileSync(contractPath, JSON.stringify(contract, null, 2), 'utf8');
    }

    /**
     * Retrieves an existing contract for a worker agent.
     */
    public getContract(threadId: string): AgentContract | null {
        const dir = this._getContractsDirPath();
        if (!dir) return null;

        const contractPath = path.join(dir, `${threadId}.json`);
        if (!fs.existsSync(contractPath)) return null;

        try {
            const content = fs.readFileSync(contractPath, 'utf8');
            return JSON.parse(content) as AgentContract;
        } catch (e) {
            console.error(`[ContractManager] Failed to read contract for ${threadId}`, e);
            return null;
        }
    }

    /**
     * Deletes a contract once a worker has completed its task.
     */
    public resolveContract(threadId: string): void {
        const dir = this._getContractsDirPath();
        if (!dir) return;

        const contractPath = path.join(dir, `${threadId}.json`);
        if (fs.existsSync(contractPath)) {
            fs.unlinkSync(contractPath);
        }
    }

    /**
     * Generates the strict system prompt override to enforce the contract boundaries.
     */
    public generateEnforcementPrompt(contract: AgentContract): string {
        let prompt = `[SYSTEM OVERRIDE: SWARM CONTRACT ENFORCEMENT]\n\n`;
        prompt += `You are operating as a specialized WORKER AGENT within a larger Swarm.\n`;
        prompt += `ROLE: ${contract.role}\n`;
        prompt += `TASK: ${contract.taskDescription}\n\n`;

        prompt += `-- - HARD CONSTRAINTS-- -\n`;
        prompt += `1. RESTRICTED SCOPE: You are only permitted to edit files within the following directories: \n`;
        contract.allowedDirectories.forEach(dir => prompt += `   - ${dir}\n`);

        if (contract.readOnlyDirectories.length > 0) {
            prompt += `\n2.READ - ONLY SCOPE: You may refer to files in these directories for context, but MUST NOT edit them: \n`;
            contract.readOnlyDirectories.forEach(dir => prompt += `   - ${dir} \n`);
        }

        prompt += `\n3. MUTEX LOCKS: The workspace is shared. You MUST check out files before editing. Run \`node .antigravity/swarm.js lock <filepath> ${contract.threadId}\` in your terminal. If it fails, another agent is editing it. Wait and try again.\n`;
        prompt += `   When finished with a file, you MUST release the lock via \`node .antigravity/swarm.js unlock <filepath> ${contract.threadId}\`.\n`;

        prompt += `\nViolation of these constraints will result in immediate termination of this thread.\n`;
        prompt += `[END OVERRIDE]\n`;

        return prompt;
    }
}
