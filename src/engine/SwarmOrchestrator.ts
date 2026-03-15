import * as vscode from 'vscode';
import { HandoffProtocol } from './HandoffProtocol';
import { ContractManager, AgentContract } from './ContractManager';
import { SwarmLockManager } from './SwarmLockManager';
import { SWARM_CLI_SCRIPT } from './SwarmCLI';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

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
        vscode.window.showInformationMessage('Auto-Continue Swarm: Analyzing Megaprompt (auto-selecting best Gemini 3 model)...');
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

        const payload = JSON.stringify({
            system_instruction: {
                parts: [{ text: systemInstruction }]
            },
            contents: [{
                parts: [{ text: `Analyze the following Megaprompt and decompose it:\n\n${prompt}` }]
            }],
            generationConfig: {
                response_mime_type: "application/json"
            }
        });

        const modelsToTry = [
            'gemini-3.1-pro-preview',
            'gemini-3.1-pro-preview-customtools',
            'gemini-3.1-flash-lite-preview',
            'gemini-3.1-flash-image-preview',
            'gemini-3-pro-preview',
            'gemini-3-pro-image-preview',
            'gemini-3-flash-preview',
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-2.0-pro-exp-02-05',
            'gemini-2.0-flash-thinking-exp-01-21',
            'gemini-2.0-flash',
            'gemini-2.0-flash-lite-preview-02-05',
            'gemini-1.5-pro',
            'gemini-1.5-flash',
            'gemini-1.5-flash-8b'
        ];

        try {
            for (const model of modelsToTry) {
                try {
                    const data = await new Promise<any>((resolve, reject) => {
                        const req = https.request(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Content-Length': Buffer.byteLength(payload)
                            }
                        }, (res) => {
                            let responseBody = '';
                            res.on('data', chunk => responseBody += chunk);
                            res.on('end', () => {
                                if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                                    reject(new Error(`API returned ${res.statusCode}: ${responseBody}`));
                                    return;
                                }
                                try {
                                    resolve(JSON.parse(responseBody));
                                } catch (e) {
                                    reject(new Error("Failed to parse Gemini API response JSON."));
                                }
                            });
                        });

                        req.on('error', reject);
                        req.write(payload);
                        req.end();
                    });

                    if (!data.candidates || data.candidates.length === 0) {
                        throw new Error(`No candidates returned from Gemini API for ${model}.`);
                    }

                    let responseText = data.candidates[0].content.parts[0].text;
                    responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

                    const parsedTasks = JSON.parse(responseText);

                    if (!Array.isArray(parsedTasks)) {
                        throw new Error(`LLM (${model}) did not return a JSON array.`);
                    }

                    console.log(`[Auto-Continue Swarm] Successfully used ${model} for decomposition.`);
                    return parsedTasks;

                } catch (e: any) {
                    console.warn(`[Auto-Continue Swarm] Model ${model} failed: ${e.message}. Trying next...`);
                }
            }
        } catch (outerError: any) {
             console.error(`[Auto-Continue Swarm] Catastrophic failure in fallback loop: ${outerError.message}`);
        }

        vscode.window.showErrorMessage(`Swarm Megaprompt Decomposition Failed: All fallback models exhausted. Please check your API key permissions.`);
        return [];
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
