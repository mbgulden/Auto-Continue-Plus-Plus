import * as vscode from 'vscode';
import * as https from 'https';
import { AgentContract, ContractManager } from './ContractManager';
import { BoltOnRegistry } from '../boltons/BoltOnRegistry';
import { BudgetManager } from './BudgetManager';
import { ZeroTrustValidator } from '../security/ZeroTrustValidator';
import { DashboardWebview } from '../ui/DashboardWebview';

export class HeadlessExecutor {
    constructor(
        private _contractManager: ContractManager,
        private _boltOnRegistry: BoltOnRegistry,
        private _budgetManager: BudgetManager,
        private _zeroTrustValidator?: ZeroTrustValidator
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

    public async execute(contract: AgentContract): Promise<void> {
        console.log(`[Headless API] Starting Swarm Worker: ${contract.role} (${contract.threadId})`);
        this._broadcastStream(contract.threadId, contract.role, 'Started Headless AI Agent.');

        const config = vscode.workspace.getConfiguration('autoContinue');
        const apiKey = config.get<string>('geminiApiKey');

        if (!apiKey) {
            console.error('[Headless API] Gemini API Key is missing.');
            vscode.window.showErrorMessage('[Headless API] Failed to start Swarm Worker: Gemini API Key is missing.');
            this._broadcastStream(contract.threadId, contract.role, 'Failed: Missing API Key', 'error');
            return;
        }

        const enforcementPrompt = this._contractManager.generateEnforcementPrompt(contract);
        const systemInstruction = `${enforcementPrompt}\n\nYour objective is: ${contract.taskDescription}. Use the provided tools to accomplish this. When finished, you must output exactly [TASK_COMPLETE].`;

        // Map BoltOns to Gemini Tools
        const allBoltOns = this._boltOnRegistry.getAll();
        const geminiTools = [{
            functionDeclarations: allBoltOns.map(boltOn => {
                let schema;
                if (boltOn.id === 'file_reader_writer') {
                    schema = {
                        type: "OBJECT",
                        properties: {
                            intent: { type: "STRING", enum: ["read_file", "write_file"] },
                            filepath: { type: "STRING", description: "The path of the file relative to the workspace root." },
                            content: { type: "STRING", description: "The content to write. Required only if intent is write_file." }
                        },
                        required: ["intent", "filepath"]
                    };
                } else {
                    schema = { type: "OBJECT" };
                }

                return {
                    name: boltOn.id,
                    description: boltOn.description,
                    parameters: schema
                };
            })
        }];

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

        let history: any[] = [{ role: "user", parts: [{ text: "Begin execution." }] }];
        let maxIterations = 15;
        let iteration = 0;

        while (iteration < maxIterations) {
            iteration++;

            if (this._budgetManager.checkCloudOverage(contract.threadId)) {
                vscode.window.showErrorMessage(`[Headless API] Swarm Worker ${contract.role} exceeded cloud API budget limit of ${contract.budgetLimit} tokens! Halting.`);
                break;
            }

            const payload = JSON.stringify({
                system_instruction: { parts: [{ text: systemInstruction }] },
                contents: history.length > 0 ? history : [{ role: "user", parts: [{ text: "Begin execution." }] }],
                tools: geminiTools
            });

            let modelResponse: any = null;
            let success = false;

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

                    if (data.candidates && data.candidates.length > 0) {
                        modelResponse = data.candidates[0].content;
                        success = true;

                        // Telemetry Recording
                        if (data.usageMetadata && data.usageMetadata.promptTokenCount !== undefined) {
                            this._budgetManager.recordCloudUsage(
                                contract.threadId, 
                                data.usageMetadata.promptTokenCount, 
                                data.usageMetadata.candidatesTokenCount || 0
                            );
                        }

                        break;
                    }
                } catch (e: any) {
                    console.warn(`[Headless API] Model ${model} failed: ${e.message}. Trying next...`);
                }
            }

            if (!success || !modelResponse) {
                console.error(`[Headless API] Swarm Thread ${contract.threadId} failed: All fallback models exhausted.`);
                vscode.window.showErrorMessage(`[Headless API] Swarm Worker ${contract.role} failed: All API fallback models exhausted.`);
                break;
            }

            history.push(modelResponse);

            let hasFunctionCall = false;
            let taskComplete = false;

            for (const part of modelResponse.parts) {
                if (part.text && part.text.includes('[TASK_COMPLETE]')) {
                    taskComplete = true;
                }
                if (part.functionCall) {
                    hasFunctionCall = true;
                    const call = part.functionCall;
                    console.log(`[Headless API] Agent ${contract.role} executing tool: ${call.name}`);
                    this._broadcastStream(contract.threadId, contract.role, `Executing tool: ${call.name}`);

                    try {
                        const boltOn = this._boltOnRegistry.get(call.name);

                        let relevantFiles: string[] = [];
                        let intent = '';
                        let contextObj: any = {};

                        if (call.name === 'file_reader_writer') {
                            intent = call.args.intent;
                            relevantFiles = [call.args.filepath];
                            if (intent === 'write_file') {
                                contextObj['content'] = call.args.content;
                            }
                        }

                        const state = {
                            taskId: contract.threadId,
                            intent: intent,
                            relevantFiles: relevantFiles,
                            context: contextObj
                        };

                        if (this._zeroTrustValidator) {
                            this._zeroTrustValidator.validateExecutionStart(boltOn, state);
                        }

                        const result = await boltOn.execute(state);

                        if (this._zeroTrustValidator) {
                            this._zeroTrustValidator.validateExecutionEnd(boltOn, result);
                        }

                        this._broadcastStream(contract.threadId, contract.role, `Tool returned: ${result.success ? 'Success' : 'Failed'}`);

                        // Push function response to history
                        history.push({
                            role: "function",
                            parts: [{
                                functionResponse: {
                                    name: call.name,
                                    response: { name: call.name, content: result }
                                }
                            }]
                        });
                    } catch (e: any) {
                        console.error(`[Headless API] Tool execution failed: ${e.message}`);
                        vscode.window.showErrorMessage(`[Headless API] Tool execution failed for ${contract.role}: ${e.message}`);
                        this._broadcastStream(contract.threadId, contract.role, `Tool Error: ${e.message}`, 'error');
                        history.push({
                            role: "function",
                            parts: [{
                                functionResponse: {
                                    name: call.name,
                                    response: { name: call.name, error: e.message }
                                }
                            }]
                        });
                    }
                }
            }

            if (taskComplete || !hasFunctionCall) {
                console.log(`[Headless API] Agent ${contract.role} finished its task.`);
                break;
            }
        }

        console.log(`[Headless API] Completed Swarm Worker: ${contract.role} (${contract.threadId})`);

        // Clean up contract
        this._contractManager.resolveContract(contract.threadId);
        this._budgetManager.resolveThread(contract.threadId);
        vscode.window.showInformationMessage(`Swarm Agent [${contract.role}] completed its headless task.`);
    }
}
