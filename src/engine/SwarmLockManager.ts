import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface FileLock {
    filePath: string;
    agentId: string;
    timestamp: number;
}

/**
 * Handles concurrent file access across multiple agents by implementing a Mutex lock system.
 * Locks are stored in a workspace-level file to be shared across isolated agent environments.
 */
export class SwarmLockManager {
    private readonly LOCK_FILE = '.antigravity/swarm_locks.json';
    private _workspaceRoot: string | undefined;
    private _fileWatcher: vscode.FileSystemWatcher | undefined;

    private _onLockChanged = new vscode.EventEmitter<void>();
    public readonly onLockChanged = this._onLockChanged.event;

    constructor() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this._workspaceRoot = workspaceFolders[0].uri.fsPath;
            this._ensureLockFileExists();
            this._setupFileWatcher();
        }
    }

    private _setupFileWatcher(): void {
        const lockPath = this._getLockFilePath();
        if (!lockPath) return;

        const pattern = new vscode.RelativePattern(path.dirname(lockPath), path.basename(lockPath));
        this._fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        const notifyChange = () => this._onLockChanged.fire();
        this._fileWatcher.onDidChange(notifyChange);
        this._fileWatcher.onDidCreate(notifyChange);
        this._fileWatcher.onDidDelete(notifyChange);
    }

    private _getLockFilePath(): string | null {
        if (!this._workspaceRoot) return null;
        return path.join(this._workspaceRoot, this.LOCK_FILE);
    }

    private _ensureLockFileExists(): void {
        const lockPath = this._getLockFilePath();
        if (!lockPath) return;

        const dir = path.dirname(lockPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (!fs.existsSync(lockPath)) {
            fs.writeFileSync(lockPath, JSON.stringify([], null, 2), 'utf8');
        }
    }

    /**
     * Reads all active locks from the shared file.
     */
    private _readLocks(): FileLock[] {
        const lockPath = this._getLockFilePath();
        if (!lockPath || !fs.existsSync(lockPath)) return [];

        try {
            const content = fs.readFileSync(lockPath, 'utf8');
            return JSON.parse(content) as FileLock[];
        } catch (e) {
            console.error('[SwarmLockManager] Error reading lock file', e);
            return [];
        }
    }

    /**
     * Writes locks to the shared file.
     */
    private _writeLocks(locks: FileLock[]): void {
        const lockPath = this._getLockFilePath();
        if (!lockPath) return;

        try {
            fs.writeFileSync(lockPath, JSON.stringify(locks, null, 2), 'utf8');
            this._onLockChanged.fire();
        } catch (e) {
            console.error('[SwarmLockManager] Error writing lock file', e);
        }
    }

    /**
     * Checks if a file is currently locked by ANY agent.
     */
    public isLocked(filePath: string): boolean {
        const locks = this._readLocks();
        // Normalize the path for consistent checks
        const normalizedPath = path.normalize(filePath);
        return locks.some(l => path.normalize(l.filePath) === normalizedPath);
    }

    /**
     * Returns the ID of the agent holding the lock, or null if unlocked.
     */
    public getLockOwner(filePath: string): string | null {
        const locks = this._readLocks();
        const normalizedPath = path.normalize(filePath);
        const lock = locks.find(l => path.normalize(l.filePath) === normalizedPath);
        return lock ? lock.agentId : null;
    }

    /**
     * Attempts to acquire a lock on a file for a specific agent.
     * @returns True if successful, false if the file is already locked by another agent.
     */
    public acquireLock(filePath: string, agentId: string): boolean {
        const locks = this._readLocks();
        const normalizedPath = path.normalize(filePath);

        const existingLockIndex = locks.findIndex(l => path.normalize(l.filePath) === normalizedPath);

        if (existingLockIndex !== -1) {
            const existingLock = locks[existingLockIndex];
            if (existingLock.agentId === agentId) {
                // Agent already has the lock, update timestamp
                existingLock.timestamp = Date.now();
                this._writeLocks(locks);
                return true;
            }
            // Another agent has the lock
            vscode.window.showWarningMessage(`[Swarm Collision Prevented] File ${path.basename(filePath)} is currently locked by Agent: ${existingLock.agentId}.`);
            return false;
        }

        // Acquire new lock
        locks.push({
            filePath: normalizedPath,
            agentId: agentId,
            timestamp: Date.now()
        });

        this._writeLocks(locks);
        console.log(`[SwarmLockManager] Lock acquired on ${path.basename(filePath)} by ${agentId}`);
        return true;
    }

    /**
     * Releases a lock held by a specific agent.
     */
    public releaseLock(filePath: string, agentId: string): void {
        const locks = this._readLocks();
        const normalizedPath = path.normalize(filePath);

        const updatedLocks = locks.filter(l => !(path.normalize(l.filePath) === normalizedPath && l.agentId === agentId));

        if (locks.length !== updatedLocks.length) {
            this._writeLocks(updatedLocks);
            console.log(`[SwarmLockManager] Lock released on ${path.basename(filePath)} by ${agentId}`);
        }
    }

    /**
     * Releases all locks held by a specific agent. Useful when an agent thread completes or crashes.
     */
    public releaseAllLocksForAgent(agentId: string): void {
        const locks = this._readLocks();
        const updatedLocks = locks.filter(l => l.agentId !== agentId);

        if (locks.length !== updatedLocks.length) {
            this._writeLocks(updatedLocks);
            console.log(`[SwarmLockManager] Released all locks for agent ${agentId}`);
        }
    }

    public dispose() {
        this._onLockChanged.dispose();
        if (this._fileWatcher) {
            this._fileWatcher.dispose();
        }
    }
}
