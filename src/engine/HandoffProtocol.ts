import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { StateManager } from '../state/StateManager';
import { ContextTracker } from './ContextTracker';
import { LineageManager } from './LineageManager';
import { AgentContract, ContractManager } from './ContractManager';
import { CDPHandler } from './CDPHandler';

export class HandoffProtocol {
    private _stateManager: StateManager;
    private _contextTracker: ContextTracker;
    private _contractManager?: ContractManager;
    private _cdpHandler?: CDPHandler;
    private _isHandingOff: boolean = false;

    constructor(stateManager: StateManager, contextTracker: ContextTracker, contractManager?: ContractManager, cdpHandler?: CDPHandler) {
        this._stateManager = stateManager;
        this._contextTracker = contextTracker;
        this._contractManager = contractManager;
        this._cdpHandler = cdpHandler;
    }

    /**
     * Helper to execute shell commands within the workspace
     */
    private async executeShellCommand(cwd: string, command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(command, { cwd }, (error, stdout, stderr) => {
                if (error) {
                    console.warn(`[Auto-Continue] Shell command failed: ${command}`, stderr);
                    reject(error);
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    }

    /**
     * Captures an automatic Git snapshot if there are uncommitted changes
     */
    private async captureGitSnapshot(workspacePath: string, threadId: string): Promise<void> {
        try {
            // Check if it's a git repo
            if (!fs.existsSync(path.join(workspacePath, '.git'))) return;

            // Check if there are changes
            try {
                await this.executeShellCommand(workspacePath, 'git diff-index --quiet HEAD --');
                return; // Exit code 0 means no changes
            } catch (e) {
                // Exit code 1 means there ARE changes, continue to commit
            }

            console.log(`[Auto-Continue] Capturing Git Snapshot for Handoff ${threadId}...`);
            await this.executeShellCommand(workspacePath, 'git add .');
            await this.executeShellCommand(workspacePath, `git commit -m "Auto-Continue Handoff Snapshot [${threadId}]"`);
            vscode.window.showInformationMessage(`Auto-Continue: Safely snapshotted codebase to Git before Handoff.`);

        } catch (e) {
            console.error('[Auto-Continue] Git Snapshot failed:', e);
        }
    }

    /**
     * Helper to grab open tabs for intelligent file scoping
     */
    private getOpenTabsScope(): string {
        const docUris = new Set<string>();
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document.uri.scheme === 'file') {
                const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
                docUris.add(relativePath);
            }
        }

        if (docUris.size === 0) return "";

        let scopeText = `\n\n[SYSTEM SCOPE RESTRICTION] Based on your open workspace tabs, you MUST concentrate your immediate efforts on the following files:\n`;
        for (const uri of docUris) {
            scopeText += `- ${uri}\n`;
        }
        return scopeText;
    }

    public async executeHandoff(): Promise<void> {
        if (this._isHandingOff) return;

        this._isHandingOff = true;
        console.log(`[Auto-Continue] Context Overload Detected. Initiating Graceful Handoff Protocol...`);
        vscode.window.showInformationMessage('Context capacity optimal limit reached. Preparing for a seamless session handoff...');

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error("No active workspace to save handoff file.");
            }

            const rootPath = workspaceFolders[0].uri.fsPath;
            const workspaceName = workspaceFolders[0].name;

            // Generate a unique identifier for this specific handoff to support multi-threading
            const timestampIdentifier = new Date().toISOString().replace(/[:.]/g, '-');
            const uniqueFilename = `.handoff_summary_${timestampIdentifier}.md`;
            const handoffFilePath = path.join(rootPath, uniqueFilename);

            // Trigger the auto-git snapshot BEFORE the agent blows away the context
            await this.captureGitSnapshot(rootPath, timestampIdentifier);

            const overridePrompt = `[SYSTEM NOTE] You are approaching your context window limit and a graceful handoff has been initiated. Please wrap up your current step. You must summarize all completed work, your current state, remaining tasks, and required file paths. YOU MUST SAVE THIS SUMMARY using your file-writing tools to a new file named \`${uniqueFilename}\` in the root of the workspace. Do not output the summary in chat, save it to the file.`;

            // Non-blocking Toast instead of {modal:true}
            vscode.window.showInformationMessage("Auto-Continue Handoff Initiated. Please wait for the AI to summarize its state...");

            try { await vscode.commands.executeCommand('antigravity.focus'); } catch (e) { /* ignore */ }
            await new Promise(resolve => setTimeout(resolve, 500));

            // Phase 1 Injection: Directly set the DOM value via WebSocket CDP to avoid the clipboard
            if (this._cdpHandler) {
                const injectScript = `
                    (function() {
                        const textarea = document.querySelector('textarea');
                        if (textarea) {
                            // Because React tracks the internal value, we must emulate native input
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
                            nativeInputValueSetter.call(textarea, ${JSON.stringify(overridePrompt)});
                            textarea.dispatchEvent(new Event('input', { bubbles: true }));

                            // Emulate Enter key
                            textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                        }
                    })();
                `;
                await this._cdpHandler.executeGlobalScript(injectScript);
            } else {
                await vscode.env.clipboard.writeText(overridePrompt);
                await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
            }

            // Poll for the unique handoff file creation using native FileSystemWatcher
            await this.waitForFile(rootPath, uniqueFilename, 120000);

            // Extract the summary text and persist the file to the historical global archive
            const summaryText = fs.readFileSync(handoffFilePath, 'utf8');

            const archiveDir = LineageManager.getArchivedSummariesPath();
            const archivePath = path.join(archiveDir, `${timestampIdentifier}.md`);
            fs.renameSync(handoffFilePath, archivePath);

            vscode.window.showInformationMessage('Summary archived successfully! Spawning new seamless thread...');

            // Scan the previous chat context before spawning new one for Deep Feature Branch detection
            const activeEditor = vscode.window.activeTextEditor;
            const previousContextText = activeEditor ? activeEditor.document.getText() : '';
            LineageManager.logSpawnedThread(timestampIdentifier, previousContextText, workspaceName);

            try {
                if (this._cdpHandler && await this._cdpHandler.isCDPAvailable()) {
                    const newChatScript = `
                        (function() {
                            const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
                            const newChatBtn = buttons.find(b => {
                                const aria = b.getAttribute('aria-label') || '';
                                const title = b.getAttribute('title') || '';
                                const txt = b.textContent || '';
                                return aria.toLowerCase().includes('new chat') ||
                                       title.toLowerCase().includes('new') ||
                                       txt.toLowerCase().includes('new chat');
                            });
                            if (newChatBtn) {
                                newChatBtn.click();
                            } else {
                                console.warn('Auto-Continue CDP: Could not find New Chat button');
                            }
                        })();
                    `;
                    await this._cdpHandler.executeGlobalScript(newChatScript);
                } else {
                    await vscode.commands.executeCommand('antigravity.chat.new');
                }
            } catch (e: any) {
                console.error('[HandoffProtocol] Failed to open new Antigravity chat:', e);
                vscode.window.showWarningMessage(`Could not automatically open new Antigravity chat. Error: ${e.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, 2000));

            const scopingPrompt = this.getOpenTabsScope();
            const newThreadPrompt = `[SYSTEM HANDOFF START] Resume work based on the following context summary from your previous session (Legacy Context ID: ${timestampIdentifier}):\n\n${summaryText}${scopingPrompt}\n\n[SYSTEM HANDOFF END] Please confirm you understand the context and outline your immediate next steps.`;

            try { await vscode.commands.executeCommand('antigravity.focus'); } catch (e) { /* ignore */ }
            await new Promise(resolve => setTimeout(resolve, 500));

            // --- FULL AUTOMATION: Direct CDP Injection ---
            if (this._cdpHandler) {
                const injectScript = `
                    (function() {
                        const textarea = document.querySelector('textarea');
                        if (textarea) {
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
                            nativeInputValueSetter.call(textarea, ${JSON.stringify(newThreadPrompt)});
                            textarea.dispatchEvent(new Event('input', { bubbles: true }));

                            // Emulate Enter key
                            textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                        }
                    })();
                `;
                await this._cdpHandler.executeGlobalScript(injectScript);
            } else {
                await vscode.env.clipboard.writeText(newThreadPrompt);
                await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
            }

            // Update State Tracking for Dashboard Visuals
            this._stateManager.incrementStat('handoffs');
            this._contextTracker.resetContext();
            this._isHandingOff = false;

            vscode.window.showInformationMessage('Auto-Continue: Handoff Complete. New Thread seamlessly created with 0 context bloat!');

        } catch (e: any) {
            console.error('[Auto-Continue] Handoff Failed', e);
            vscode.window.showErrorMessage(`Handoff Failed: ${e.message}`);
            this._isHandingOff = false;
        }
    }

    /**
     * Executes a programmatic handoff to spawn a new worker thread within the Swarm.
     * Bypasses the active summary requirement and directly injects the strict Contract.
     */
    public async executeSwarmSpawn(threadId: string, contract: AgentContract): Promise<void> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            const workspaceName = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].name : 'Unknown';

            // 1. Log the thread spawn in Lineage map
            // We use the current editor's legacy context ID as the parent to build the tree
            const activeEditor = vscode.window.activeTextEditor;
            const previousContextText = activeEditor ? activeEditor.document.getText() : '';
            LineageManager.logSpawnedThread(threadId, previousContextText, workspaceName);

            // 2. Spawn the new AI side panel
            try {
                if (this._cdpHandler && await this._cdpHandler.isCDPAvailable()) {
                    const newChatScript = `
                        (function() {
                            const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
                            const newChatBtn = buttons.find(b => {
                                const aria = b.getAttribute('aria-label') || '';
                                const title = b.getAttribute('title') || '';
                                const txt = b.textContent || '';
                                return aria.toLowerCase().includes('new chat') ||
                                       title.toLowerCase().includes('new') ||
                                       txt.toLowerCase().includes('new chat');
                            });
                            if (newChatBtn) {
                                newChatBtn.click();
                            } else {
                                console.warn('Auto-Continue CDP: Could not find New Chat button');
                            }
                        })();
                    `;
                    await this._cdpHandler.executeGlobalScript(newChatScript);
                } else {
                    await vscode.commands.executeCommand('antigravity.chat.new');
                }
            } catch (e) {
                vscode.window.showWarningMessage('Could not automatically open new Antigravity chat. Please open one manually.');
            }

            await new Promise(resolve => setTimeout(resolve, 2000));

            // 3. Generate the strict enforcement prompt
            let contractPrompt = '';
            if (this._contractManager) {
                contractPrompt = this._contractManager.generateEnforcementPrompt(contract);
            }

            const newThreadPrompt = `${contractPrompt}\n\n[SYSTEM] Please acknowledge your Worker Contract and state your immediate first step. You MUST use your assigned tools to begin work immediately.`;

            try { await vscode.commands.executeCommand('antigravity.focus'); } catch (e) { /* ignore */ }
            await new Promise(resolve => setTimeout(resolve, 500));

            // --- FULL AUTOMATION: Direct Swarm Spawn Injection ---
            if (this._cdpHandler) {
                const injectScript = `
                    (function() {
                        const textarea = document.querySelector('textarea');
                        if (textarea) {
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
                            nativeInputValueSetter.call(textarea, ${JSON.stringify(newThreadPrompt)});
                            textarea.dispatchEvent(new Event('input', { bubbles: true }));

                            // Emulate Enter key
                            textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                        } else {
                            console.error('Auto-Continue CDP: Textarea not found for injection');
                        }
                    })();
                `;
                try {
                    await this._cdpHandler.executeGlobalScript(injectScript);
                } catch (e: any) {
                    console.error('[HandoffProtocol] CDP script execution failed:', e);
                    vscode.window.showErrorMessage(`CDP Injection Failed: ${e.message}`);
                }
            } else {
                try {
                    await vscode.env.clipboard.writeText(newThreadPrompt);
                    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
                } catch (e: any) {
                    console.error('[HandoffProtocol] Clipboard paste failed:', e);
                    vscode.window.showErrorMessage(`Clipboard Paste Failed: ${e.message}`);
                }
            }

        } catch (e: any) {
            console.error('[Auto-Continue Swarm] Delegate Spawn Failed', e);
            vscode.window.showErrorMessage(`Delegate Spawn Failed: ${e.message}`);
        }
    }

    private async waitForFile(rootPath: string, filename: string, timeoutMs: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const filePath = path.join(rootPath, filename);
            if (fs.existsSync(filePath)) {
                return resolve();
            }

            const pattern = new vscode.RelativePattern(rootPath, filename);
            // Ignore change and delete, only watch verify creates
            const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, true, true);

            let timeoutId: NodeJS.Timeout;

            const cleanup = () => {
                watcher.dispose();
                clearTimeout(timeoutId);
            };

            watcher.onDidCreate(() => {
                cleanup();
                // Give it a tiny buffer to avoid read-before-write-finish issues
                setTimeout(resolve, 500);
            });

            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error("Timeout waiting for Agent to create handoff summary file"));
            }, timeoutMs);
        });
    }

    public get isHandingOff(): boolean {
        return this._isHandingOff;
    }
}
