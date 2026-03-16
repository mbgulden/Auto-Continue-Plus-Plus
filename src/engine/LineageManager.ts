import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentHeartbeat } from './ContextTracker';

export interface LineageMeta {
    id: string;
    parentId: string; // 'root' if top-level
    depth: number;
    timestamp: string;
    workspaceName?: string;
}

export interface GlobalConversation {
    id: string;
    title: string;
    status: 'Completed' | 'In Progress' | 'Needs Input';
    progressPct: number;
    lastModifiedMs: number;
    idleMins: number;
}

export class LineageManager {

    /**
     * Gets the absolute path to the lineage_meta directory in the global brain
     */
    private static getLineagePath(): string {
        const homeDir = process.env.USERPROFILE || process.env.HOME || '';
        const dir = path.join(homeDir, '.gemini', 'antigravity', 'lineage_meta');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }

    /**
     * Gets the absolute path to the active agent sessions directory
     */
    private static getActiveSessionsPath(): string {
        const homeDir = process.env.USERPROFILE || process.env.HOME || '';
        const dir = path.join(homeDir, '.gemini', 'antigravity', 'active_sessions');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }

    /**
     * Gets the absolute path to the global Antigravity brain
     */
    private static getGlobalBrainPath(): string {
        const homeDir = process.env.USERPROFILE || process.env.HOME || '';
        return path.join(homeDir, '.gemini', 'antigravity', 'brain');
    }

    /**
     * Gets the folder where historical AI Context Summaries are persisted
     */
    public static getArchivedSummariesPath(): string {
        const dir = path.join(this.getLineagePath(), 'summaries');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }

    /**
     * Reads all heartbeats representing currently open VS Code Agent Managers
     */
    public static getActiveSessions(): AgentHeartbeat[] {
        const dir = this.getActiveSessionsPath();
        if (!fs.existsSync(dir)) return [];

        const files = fs.readdirSync(dir);
        const sessions: AgentHeartbeat[] = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = fs.readFileSync(path.join(dir, file), 'utf8');
                    sessions.push(JSON.parse(content));
                } catch (e) {
                    console.error('[LineageManager] Error parsing session file', file, e);
                }
            }
        }

        // Sort by most recently updated
        sessions.sort((a, b) => b.timestamp - a.timestamp);
        return sessions;
    }

    /**
     * Power User: Scans the entire Antigravity Brain to build a heuristic map of all global conversations
     */
    public static getGlobalConversations(): GlobalConversation[] {
        const brainDir = this.getGlobalBrainPath();
        if (!fs.existsSync(brainDir)) return [];

        const conversations: GlobalConversation[] = [];
        const folders = fs.readdirSync(brainDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        const now = Date.now();

        for (const folderId of folders) {
            const folderPath = path.join(brainDir, folderId);
            const taskPath = path.join(folderPath, 'task.md');
            const planPath = path.join(folderPath, 'implementation_plan.md');
            const walkPath = path.join(folderPath, 'walkthrough.md');

            let title = `Conversation ${folderId.substring(0, 8)}`;
            let status: 'Completed' | 'In Progress' | 'Needs Input' = 'Needs Input';
            let progressPct = 0;
            let lastModifiedMs = 0;

            // Compute last modified based on the folder stats
            try {
                const stats = fs.statSync(folderPath);
                lastModifiedMs = stats.mtimeMs;
            } catch (e) { }

            // Heuristic 1: Is it completed?
            if (fs.existsSync(walkPath)) {
                status = 'Completed';
                progressPct = 100;

                // Try to grab title from walkthrough
                try {
                    const content = fs.readFileSync(walkPath, 'utf8');
                    const match = content.match(/^#\s+(.+)$/m);
                    if (match && match[1]) title = match[1].trim();
                } catch (e) { }
            }
            // Heuristic 2: Is it in progress?
            else if (fs.existsSync(taskPath)) {
                status = 'In Progress';
                try {
                    const content = fs.readFileSync(taskPath, 'utf8');
                    // Extract Title
                    const match = content.match(/^#\s+(.+)$/m);
                    if (match && match[1]) {
                        title = match[1].trim();
                        // Strip generic trailing words if present
                        title = title.replace(/\sTasks$/, '').replace(/\sChecklist$/, '');
                    }

                    // Extract Progress
                    const totalTasks = (content.match(/- \[[x ]\]/g) || []).length;
                    const completedTasks = (content.match(/- \[x\]/g) || []).length;

                    if (totalTasks > 0) {
                        progressPct = Math.round((completedTasks / totalTasks) * 100);
                        if (progressPct === 100) status = 'Completed'; // Edge case where walkthough isn't written yet but tasks are done
                    } else {
                        status = 'Needs Input';
                    }
                } catch (e) { }
            }
            // Heuristic 3: Planning Phase
            else if (fs.existsSync(planPath)) {
                status = 'Needs Input';
                try {
                    const content = fs.readFileSync(planPath, 'utf8');
                    const match = content.match(/^#\s+(?:Objective:\s+)?(.+)$/m);
                    if (match && match[1]) title = match[1].trim();
                } catch (e) { }
            }

            const idleMins = Math.round((now - lastModifiedMs) / 60000);

            conversations.push({
                id: folderId,
                title,
                status,
                progressPct,
                lastModifiedMs,
                idleMins
            });
        }

        // Sort by most recently active
        conversations.sort((a, b) => b.lastModifiedMs - a.lastModifiedMs);
        return conversations;
    }

    /**
     * Reads all standalone lineage JSON files and parses them into a list
     */
    public static getAllLineage(): LineageMeta[] {
        const dir = this.getLineagePath();
        if (!fs.existsSync(dir)) return [];
        const files = fs.readdirSync(dir);
        const lineageList: LineageMeta[] = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = fs.readFileSync(path.join(dir, file), 'utf8');
                    lineageList.push(JSON.parse(content));
                } catch (e) {
                    // Ignore parsing errors, it could just be an empty or corrupted file
                }
            }
        }

        // Sort chronologically (newest first for the UI)
        lineageList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return lineageList;
    }

    /**
     * Evaluates text to find any Legacy Context IDs to determine if this is a Deep Feature Branch.
     * Writes out the standalone metadata file.
     * @param threadId The ID of the newly spawned thread.
     * @param contextText The active document text or summary to scan for parents.
     * @param workspaceName The optional workspace name to append for the cross-workspace dashboard.
     */
    public static logSpawnedThread(threadId: string, contextText: string, workspaceName?: string): void {
        const parentMatch = contextText.match(/Legacy Context ID: ([\w-]+)/);
        let parentId = 'root';
        let depth = 1;

        if (parentMatch && parentMatch[1]) {
            parentId = parentMatch[1];
            // Find parent depth
            const allLineage = this.getAllLineage();
            const parentNode = allLineage.find(l => l.id === parentId);
            if (parentNode) {
                depth = parentNode.depth + 1;
            } else {
                depth = 2; // Default to 2 if we found an ID but missing meta
            }
        }

        const meta: LineageMeta = {
            id: threadId,
            parentId: parentId,
            depth: depth,
            timestamp: new Date().toISOString(),
            workspaceName: workspaceName
        };

        const filePath = path.join(this.getLineagePath(), `${threadId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(meta, null, 2), 'utf8');
    }

    /**
     * Searches the explicit historical summaries path for this archived feature branch and opens it.
     * @param threadId The thread ID to locate and open.
     */
    public static async openThreadFile(threadId: string): Promise<void> {
        try {
            const summaryPath = path.join(this.getArchivedSummariesPath(), `${threadId}.md`);

            if (fs.existsSync(summaryPath)) {
                const doc = await vscode.workspace.openTextDocument(summaryPath);
                await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
            } else {
                vscode.window.showWarningMessage('Auto-Continue: Could not locate the archived conversation summary for this thread. It may have been deleted.');
            }
        } catch (e: any) {
            console.error('[LineageManager] Error opening thread file', e);
            vscode.window.showErrorMessage(`Auto-Continue: Error opening thread file: ${e.message}`);
        }
    }

    /**
     * Opens the global brain folder for a specific conversation ID.
     */
    public static async openBrainFolder(threadId: string): Promise<void> {
        try {
            const brainPath = path.join(this.getGlobalBrainPath(), threadId);
            if (fs.existsSync(brainPath)) {
                const uri = vscode.Uri.file(brainPath);
                // Open folder in a new window so it doesn't kill their current workspace
                await vscode.commands.executeCommand('vscode.openFolder', uri, true);
            } else {
                vscode.window.showWarningMessage(`Auto-Continue: Could not locate brain folder for ID ${threadId}`);
            }
        } catch (e: any) {
            console.error('[LineageManager] Error opening brain folder', e);
        }
    }

    /**
     * Completely wipes the lineage history map (useful for dashboard resets).
     */
    public static clearLineageHistory(): void {
        const dir = this.getLineagePath();
        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                fs.unlinkSync(path.join(dir, file));
            }
        }
    }
}
