import { exec } from 'child_process';
import * as os from 'os';

export interface AntigravityConnectionParams {
    port: number;
    authToken: string;
}

export class ProcessScanner {

    /**
     * Scans the OS processes to find the AI Language Server matching 'antigravity', 'cline', etc.
     * and extracts the --port and --auth-token parameters for API hijacking.
     */
    public static async findLanguageServer(): Promise<AntigravityConnectionParams | null> {
        return new Promise((resolve) => {
            const platform = os.platform();
            let command = '';

            // Using pure OS commands to sniff the processes safely
            if (platform === 'win32') {
                command = 'wmic process get commandline';
            } else {
                command = 'ps -eo command';
            }

            // Execute the system level command to grab all running processes
            exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
                if (error || !stdout) {
                    console.error('[ProcessScanner] Failed to scan processes:', error);
                    return resolve(null);
                }

                const lines = stdout.split('\n');

                for (const line of lines) {
                    // Ensure the process line looks like a background node language server
                    if ((line.includes('antigravity') || line.includes('cline') || line.includes('roo-cline') || line.includes('continue')) && line.includes('--port')) {
                        const portMatch = line.match(/(?:--port|-p)\s*=?\s*(\d+)/i);
                        const tokenMatch = line.match(/(?:--auth-token|--token|--key)\s*=?\s*([a-zA-Z0-9_-]+)/i);

                        if (portMatch && portMatch[1]) {
                            return resolve({
                                port: parseInt(portMatch[1], 10),
                                authToken: tokenMatch && tokenMatch[1] ? tokenMatch[1] : ''
                            });
                        }
                    }
                }

                resolve(null);
            });
        });
    }
}
