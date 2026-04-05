import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { AgentContract, ContractManager } from './ContractManager';
import { BudgetManager } from './BudgetManager';
import { DashboardWebview } from '../ui/DashboardWebview';

export class JulesExecutor {
    constructor(
        private _contractManager: ContractManager,
        private _budgetManager: BudgetManager
    ) {}

    private _broadcastStream(threadId: string, role: string, message: string, type: 'info' | 'error' | 'success' = 'info') {
        const panel = DashboardWebview.currentPanel?.getWebview();
        if (panel) {
            panel.postMessage({
                command: 'streamLog',
                log: { timestamp: Date.now(), threadId, role, message, type }
            });
        }
    }

    private _updateSwarmDashboard(message: string) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return;
        const artifactsDir = path.join(workspaceFolders[0].uri.fsPath, '.agents', 'artifacts');
        if (!fs.existsSync(artifactsDir)) {
            fs.mkdirSync(artifactsDir, { recursive: true });
        }
        const dashboardPath = path.join(artifactsDir, 'swarm_dashboard.md');
        let currentContent = '';
        if (fs.existsSync(dashboardPath)) {
            currentContent = fs.readFileSync(dashboardPath, 'utf8');
        }
        const timestamp = new Date().toISOString();
        const appendText = `\n- **[${timestamp}] JULES CLOUD:** ${message}`;
        fs.writeFileSync(dashboardPath, currentContent + appendText, 'utf8');
    }

    private async _executeShellCommand(cwd: string, command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(command, { cwd }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    }

    public async execute(contract: AgentContract): Promise<void> {
        console.log(`[GitHub Jules] Starting Cloud Swarm Worker: ${contract.role} (${contract.threadId})`);
        this._broadcastStream(contract.threadId, contract.role, 'Starting GitHub Jules Cloud Orchestration...');
        this._updateSwarmDashboard(`Initializing session for ${contract.role} (${contract.threadId})...`);

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this._broadcastStream(contract.threadId, contract.role, 'Failed: No workspace active', 'error');
            return;
        }
        
        const cwd = workspaceFolders[0].uri.fsPath;
        const isGitRepo = fs.existsSync(path.join(cwd, '.git'));
        
        if (!isGitRepo) {
            this._broadcastStream(contract.threadId, contract.role, 'Failed: Jules requires a Git repository to sync changes.', 'error');
            vscode.window.showErrorMessage('[GitHub Jules] Failed: Current workspace must be a Git repository.');
            return;
        }

        try {
            // Step 1: Snapshot and Push branch
            this._broadcastStream(contract.threadId, contract.role, 'Checkpointing local code to GitHub...');
            this._updateSwarmDashboard('Pushing uncommitted local state to GitHub remote branch...');
            
            try {
                // If there are no changes, add will succeed, commit will throw code 1
                await this._executeShellCommand(cwd, 'git add .');
                await this._executeShellCommand(cwd, `git commit -m "Auto-checkpoint: Preparing for Jules Cloud Review [${contract.threadId}]"`);
            } catch (e) {
                // Ignore empty-commit errors
            }
            
            await this._executeShellCommand(cwd, 'git push');
            
            // Step 2: Spawn Jules Remote worker 
            this._broadcastStream(contract.threadId, contract.role, 'Spawning Remote Cloud Session...');
            this._updateSwarmDashboard(`Executing 'jules remote new' with task definition...`);
            
            // For security, escape quotes in the prompt
            const safePrompt = contract.taskDescription.replace(/"/g, '\\"');
            const julesRes = await this._executeShellCommand(cwd, `jules remote new --repo . --session "${safePrompt}"`);
            
            // Expected stdout: Session spawned! Session ID: sub-task-xyz
            // Or something similar. We log whatever Jules returns
            const sessionMatch = julesRes.match(/(Session ID|session_id|id)[:=]\s*([A-Za-z0-9_-]+)/i);
            let sessionId = sessionMatch ? sessionMatch[2] : 'UNKNOWN_SESSION';
            
            this._broadcastStream(contract.threadId, contract.role, `Jules Session Active! ID: ${sessionId}`, 'success');
            this._updateSwarmDashboard(`Jules Cloud Session natively initiated. Session ID: **${sessionId}**.\n\nRaw output:\n\`\`\`bash\n${julesRes}\n\`\`\``);

            // Jules is asynchronous, we do not block the node thread on pull. We instruct the user to run pull later.
            // Ideally Jules notifies via webhook, but for CLI we yield text.
            vscode.window.showInformationMessage(`GitHub Jules session spawned: ${sessionId}.`);
            
        } catch (e: any) {
            console.error(`[GitHub Jules] Execution Failed:`, e);
            this._broadcastStream(contract.threadId, contract.role, `Shell exception: ${e.message}`, 'error');
            this._updateSwarmDashboard(`CRITICAL ERROR during Jules Orchestration: ${e.message}`);
        }

        this._contractManager.resolveContract(contract.threadId);
        this._budgetManager.resolveThread(contract.threadId);
        console.log(`[GitHub Jules] Completed setup for: ${contract.role} (${contract.threadId})`);
    }
}
