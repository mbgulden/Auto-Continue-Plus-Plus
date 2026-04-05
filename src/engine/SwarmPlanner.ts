import * as vscode from 'vscode';
import * as https from 'https';
import { AgentContract } from './ContractManager';

export class SwarmPlanner {
    public async decomposeMegaprompt(megaprompt: string, useJules: boolean = false): Promise<AgentContract[]> {
        vscode.window.showInformationMessage('Auto-Continue Swarm: Analyzing Megaprompt (auto-selecting best Gemini 3 model)...');
        const tasks = await this._decomposePromptWithGemini(megaprompt, useJules);

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
                readOnlyDirectories: t.readOnlyDirectories || [],
                targetHead: t.targetHead || 'Headless API',
                budgetLimit: undefined,
                localContextMax: 8192
            };
        });
    }

    private async _decomposePromptWithGemini(prompt: string, useJules: boolean): Promise<Array<{ role: string, description: string, allowedDirectories: string[], readOnlyDirectories: string[], targetHead: 'Antigravity UI' | 'Headless API' | 'Local AI' | 'GitHub Jules' }>> {
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
    "readOnlyDirectories": ["string (e.g., 'src/api/types.ts')"],
    "targetHead": "string (MUST BE EXACTLY ONE OF: 'Antigravity UI' OR 'Headless API' OR 'Local AI' OR 'GitHub Jules')"
  }
]
- Use 'Antigravity UI' if the task requires deep codebase understanding or complex planning.
- Use 'Headless API' for parallel code generation or independent testing.
- Use 'Local AI' for fast, simple tasks like syntax checks, formatting, or simple refactors.
${useJules ? "- HIGH PRIORITY: The user specifically requested GitHub Jules! You MUST map any code-review, large refactoring, or remote-cloud tasks to 'GitHub Jules'." : ""}
`;

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
}
