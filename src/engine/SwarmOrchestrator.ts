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
     * Accepts a user's megaprompt and returns the parsed AgentContracts for UI review.
     * Does NOT spawn them immediately.
     */
    public async decomposeMegaprompt(megaprompt: string): Promise<AgentContract[]> {
        vscode.window.showInformationMessage('Auto-Continue Swarm: Analyzing Megaprompt with Gemini 3.1 Pro...');
        const tasks = await this._decomposePromptWithGemini(megaprompt);

        if (tasks.length === 0) {
            vscode.window.showWarningMessage('Auto-Continue Swarm: Could not parse delegates. Please check your API key or prompt.');
            return [];
        }

        return tasks.map(t => {
            const timestampIdentifier = new Date().toISOString().replace(/[:.]/g, '-') + `-${Math.floor(Math.random() * 1000)}`;
            return {
                threadId: timestampIdentifier,
                role: t.role,
                taskDescription: t.description,
                allowedDirectories: t.allowedDirectories || ['src/'],
                readOnlyDirectories: t.readOnlyDirectories || []
            };
        });
    }

    /**
     * Accepts a list of confirmed AgentContracts and spawns them.
     */
    public async spawnDelegatesFromContracts(contracts: AgentContract[]): Promise<void> {
        this._provisionSwarmCLI();

        vscode.window.showInformationMessage(`Auto-Continue Swarm: Provisioning ${contracts.length} Worker Agents concurrently.`);

        for (const contract of contracts) {
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
     * Intelligent parser using Gemini REST API to break down a Megaprompt into structured JSON.
     */
    private async _decomposePromptWithGemini(prompt: string): Promise<Array<{ role: string, description: string, allowedDirectories: string[], readOnlyDirectories: string[] }>> {
        try {
            const config = vscode.workspace.getConfiguration('autoContinue');
            const apiKey = config.get<string>('geminiApiKey');

            if (!apiKey) {
                vscode.window.showErrorMessage('Auto-Continue Swarm: Gemini API Key is missing. Please add it in settings (autoContinue.geminiApiKey).');
                return [];
            }

            const systemInstruction = `You are the Swarm Orchestrator Manager. Your job is to take a user's large feature request (Megaprompt) and break it down into distinct, specialized, non-overlapping tasks for Worker Agents. 
You MUST output ONLY valid JSON format. No markdown blocks, no conversational text. Just the raw JSON array.

The JSON schema MUST be an array of objects matching this exact structure:
[
  {
    "role": "string (e.g., 'Frontend Worker', 'Database Engineer')",
    "description": "string (Detailed, exhaustive instructions of what exactly this agent should do. MUST include ALL context from the prompt.)",
    "allowedDirectories": ["string (e.g., 'src/ui', 'styles/')"],
    "readOnlyDirectories": ["string (e.g., 'src/api/types.ts')"]
  }
]`;

            // Using standard fetch for REST call
            // Using gemini-1.5-pro as the robust planner model (aka "3.1 Pro" equivalent capabilities)
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    system_instruction: {
                        parts: [{ text: systemInstruction }]
                    },
                    contents: [{
                        parts: [{ text: `Analyze the following Megaprompt and decompose it:\n\n${prompt}` }]
                    }],
                    generationConfig: {
                        response_mime_type: "application/json"
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Gemini API returned ${response.status} ${response.statusText}`);
            }

            const data: any = await response.json();

            if (!data.candidates || data.candidates.length === 0) {
                throw new Error("No candidates returned from Gemini API.");
            }

            let responseText = data.candidates[0].content.parts[0].text;

            // Clean up potential markdown formatting from the response
            responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

            const parsedTasks = JSON.parse(responseText);

            if (!Array.isArray(parsedTasks)) {
                throw new Error("LLM did not return a JSON array.");
            }

            return parsedTasks;

        } catch (e: any) {
            console.error('[Auto-Continue Swarm] Decomposition failed:', e);
            vscode.window.showErrorMessage(`Swarm Megaprompt Decomposition Failed: ${e.message}`);
            return [];
        }
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
