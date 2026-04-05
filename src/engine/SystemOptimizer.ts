import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ContextTracker } from './ContextTracker';

export class SystemOptimizer implements vscode.Disposable {
    private _contextTracker: ContextTracker;
    private _ramCheckInterval: NodeJS.Timeout | null = null;
    private _tempCheckInterval: NodeJS.Timeout | null = null;

    private readonly RAM_CHECK_MS = 5 * 60 * 1000; // Check every 5 minutes
    private readonly TEMP_CHECK_MS = 12 * 60 * 60 * 1000; // Check every 12 hours
    private readonly TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours max age

    constructor(contextTracker: ContextTracker) {
        this._contextTracker = contextTracker;
    }

    public start() {
        if (!this._ramCheckInterval) {
            this._ramCheckInterval = setInterval(() => this.checkAndFlushRAM(), this.RAM_CHECK_MS);
        }
        if (!this._tempCheckInterval) {
            // Run temp cleanup immediately on startup, then on interval
            this.purgeTempFiles();
            this._tempCheckInterval = setInterval(() => this.purgeTempFiles(), this.TEMP_CHECK_MS);
        }
        console.log("[SystemOptimizer] Background optimization service started.");
    }

    public stop() {
        if (this._ramCheckInterval) {
            clearInterval(this._ramCheckInterval);
            this._ramCheckInterval = null;
        }
        if (this._tempCheckInterval) {
            clearInterval(this._tempCheckInterval);
            this._tempCheckInterval = null;
        }
    }

    private checkAndFlushRAM() {
        const healthPct = this._contextTracker.getHealthPercentage() * 100;
        
        // If Context Health drops (simulating heavy load >= 85%), trigger RAM flush natively
        if (healthPct >= 85) {
            console.log(`[SystemOptimizer] Context Health is critical (${Math.round(healthPct)}%). Triggering background RAM flush.`);
            cp.exec(`schtasks /run /tn "Antigravity_RAM_Clear"`, (error) => {
                if (error) {
                    console.debug("[SystemOptimizer] RAM flush failed or task not installed.");
                } else {
                    console.log("[SystemOptimizer] Standby RAM successfully flushed.");
                }
            });
        }
    }

    private purgeTempFiles() {
        try {
            // We only clean the /tmp directory to avoid touching persistent artifacts or logs
            const geminiDir = path.join(os.homedir(), '.gemini', 'antigravity', 'tmp');
            
            if (!fs.existsSync(geminiDir)) {
                return;
            }

            const now = Date.now();
            let deletedCount = 0;

            const files = fs.readdirSync(geminiDir);
            for (const file of files) {
                const filePath = path.join(geminiDir, file);
                const stats = fs.statSync(filePath);

                // Check if file is older than our allowed threshold
                if (stats.isFile() && (now - stats.mtimeMs) > this.TEMP_MAX_AGE_MS) {
                    try {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    } catch (err) {
                        console.debug(`[SystemOptimizer] Failed to delete temp file ${file}:`, err);
                    }
                }
            }

            if (deletedCount > 0) {
                console.log(`[SystemOptimizer] Purged ${deletedCount} stale temporary artifacts to free disk space.`);
            }

        } catch (err) {
            console.error(`[SystemOptimizer] Temp folder purge encountered an error:`, err);
        }
    }

    public dispose() {
        this.stop();
    }
}
