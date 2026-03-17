import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { IBoltOn, AgentTaskState, AgentTaskResult } from '../types';
import { ContractManager } from '../../engine/ContractManager';
import { SwarmLockManager } from '../../engine/SwarmLockManager';

export class FileReaderWriterBoltOn implements IBoltOn {
    public readonly id = 'file_reader_writer';
    public readonly description = 'Reads and writes files in the workspace. Use "read_file" to read content, and "write_file" to write content. Both require the file path relative to the workspace root.';

    private _contractManager: ContractManager;
    private _lockManager: SwarmLockManager;
    private _workspaceRoot: string;

    constructor(contractManager: ContractManager, lockManager: SwarmLockManager) {
        this._contractManager = contractManager;
        this._lockManager = lockManager;

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('FileReaderWriterBoltOn requires an active workspace.');
        }
        this._workspaceRoot = workspaceFolders[0].uri.fsPath;
    }

    public validatePreConditions(state: AgentTaskState): void {
        const { taskId, intent, relevantFiles } = state;

        if (!intent || (intent !== 'read_file' && intent !== 'write_file')) {
            throw new Error(`[FileReaderWriter] Invalid intent: '${intent}'. Must be 'read_file' or 'write_file'.`);
        }

        if (!relevantFiles || relevantFiles.length === 0) {
            throw new Error('[FileReaderWriter] No relevant files provided.');
        }

        const contract = this._contractManager.getContract(taskId);
        if (!contract) {
            throw new Error(`[FileReaderWriter] No active contract found for thread ID: ${taskId}`);
        }

        for (const filePath of relevantFiles) {
            const absolutePath = path.resolve(this._workspaceRoot, filePath);
            const relativePath = path.relative(this._workspaceRoot, absolutePath).replace(/\\/g, '/');

            // Prevent Path Traversal
            if (relativePath.startsWith('..')) {
                throw new Error(`[FileReaderWriter] Security Violation: Path traversal detected. Agent is attempting to access outside the workspace root: '${filePath}'.`);
            }

            // 1. Directory Boundary Enforcement
            let isAllowed = contract.allowedDirectories.some(dir => relativePath.startsWith(dir));
            let isReadOnly = contract.readOnlyDirectories.some(dir => relativePath.startsWith(dir));

            if (intent === 'write_file') {
                if (!isAllowed || isReadOnly) {
                    throw new Error(`[FileReaderWriter] Security Violation: Agent '${contract.role}' (${taskId}) is not permitted to WRITE to '${filePath}'. Allowed directories: ${contract.allowedDirectories.join(', ')}`);
                }

                // 2. Mutex Lock Enforcement
                if (this._lockManager.isLocked(absolutePath)) {
                    const lockOwner = this._lockManager.getLockOwner(absolutePath);
                    if (lockOwner !== taskId) {
                        throw new Error(`[FileReaderWriter] Mutex Conflict: File '${filePath}' is currently locked by another agent (${lockOwner}). Wait and retry later.`);
                    }
                }
            } else if (intent === 'read_file') {
                if (!isAllowed && !isReadOnly) {
                    throw new Error(`[FileReaderWriter] Security Violation: Agent '${contract.role}' (${taskId}) is not permitted to READ from '${filePath}'.`);
                }
            }
        }
    }

    public async execute(state: AgentTaskState): Promise<AgentTaskResult> {
        this.validatePreConditions(state);

        const { taskId, intent, relevantFiles, context } = state;
        const filePath = relevantFiles[0];
        const absolutePath = path.resolve(this._workspaceRoot, filePath);

        try {
            if (intent === 'read_file') {
                if (!fs.existsSync(absolutePath)) {
                    return {
                        success: false,
                        message: `File not found: ${filePath}`,
                        errorDetails: 'The specified file does not exist.'
                    };
                }

                const content = fs.readFileSync(absolutePath, 'utf8');
                return {
                    success: true,
                    message: `Successfully read file: ${filePath}`,
                    outputData: { content }
                };

            } else if (intent === 'write_file') {
                const newContent = context['content'] as string;
                if (typeof newContent !== 'string') {
                    return {
                        success: false,
                        message: `Invalid content provided for write_file.`,
                        errorDetails: 'The context object must contain a "content" string.'
                    };
                }

                // Acquire Lock before writing
                const acquired = this._lockManager.acquireLock(absolutePath, taskId);
                if (!acquired) {
                    return {
                        success: false,
                        message: `Failed to acquire lock for file: ${filePath}`,
                        errorDetails: 'Another agent might have locked it right after pre-conditions check.'
                    };
                }

                try {
                    // Ensure directory exists
                    const dir = path.dirname(absolutePath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    fs.writeFileSync(absolutePath, newContent, 'utf8');

                    return {
                        success: true,
                        message: `Successfully wrote to file: ${filePath}`
                    };
                } finally {
                    // Always release lock when done writing
                    this._lockManager.releaseLock(absolutePath, taskId);
                }
            }

            return { success: false, message: 'Unknown intent executed.' };

        } catch (error: any) {
            return {
                success: false,
                message: `Failed to execute ${intent} on ${filePath}`,
                errorDetails: error.message
            };
        }
    }

    public validatePostConditions(result: AgentTaskResult): void {
        if (!result.success && !result.errorDetails) {
            throw new Error('[FileReaderWriter] Post-Condition Failed: A failed execution must provide errorDetails.');
        }
        if (result.success && result.outputData && result.outputData.content === undefined) {
             throw new Error('[FileReaderWriter] Post-Condition Failed: A successful read_file must provide content in outputData.');
        }
    }
}
