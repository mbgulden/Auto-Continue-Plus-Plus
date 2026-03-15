import * as http from 'http';
import { ProcessScanner, AntigravityConnectionParams } from './ProcessScanner';

export interface ModelQuotaStatus {
    modelId: string;
    refreshMinutesRemaining: number;
    creditsRemaining: number;
    creditsTotal: number;
}

/**
 * Handles secret internal API requests directly to the Antigravity Language Server running on localhost.
 * This completely bypasses the extension memory container security.
 */
export class AntigravityAPI {
    private static _connection: AntigravityConnectionParams | null = null;
    private static _lastCheckTime: number = 0;

    /**
     * Retrieves and locally caches the connection parameters.
     */
    public static async getConnection(): Promise<AntigravityConnectionParams | null> {
        const now = Date.now();
        // Cache connection params for 10 minutes to avoid spamming the OS process list
        if (this._connection && (now - this._lastCheckTime < 600000)) {
            return this._connection;
        }

        const conn = await ProcessScanner.findLanguageServer();
        if (conn) {
            this._connection = conn;
            this._lastCheckTime = now;
        }
        return conn;
    }

    /**
     * Secret API Call to fetch the real model quota statuses.
     */
    public static async getQuotaStatus(): Promise<ModelQuotaStatus[] | null> {
        const conn = await this.getConnection();
        if (!conn) return null;

        return new Promise((resolve) => {
            const options = {
                hostname: '127.0.0.1',
                port: conn.port,
                path: '/GetUserStatus',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${conn.authToken}`,
                    'Accept': 'application/json'
                },
                timeout: 3000
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const parsed = JSON.parse(data);
                            resolve(parsed.models || parsed.quotas || []);
                        } catch (e) {
                            resolve(null);
                        }
                    } else {
                        resolve(null);
                    }
                });
            });

            req.on('error', () => resolve(null));
            req.on('timeout', () => {
                req.destroy();
                resolve(null);
            });
            req.end();
        });
    }

    /**
     * Queries the Active AI Model limits for dynamic Handoff resizing.
     */
    public static async getCurrentModel(): Promise<string | null> {
        const conn = await this.getConnection();
        if (!conn) return null;

        return new Promise((resolve) => {
            const options = {
                hostname: '127.0.0.1',
                port: conn.port,
                path: '/GetConfig',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${conn.authToken}`,
                    'Accept': 'application/json'
                },
                timeout: 2000
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const parsed = JSON.parse(data);
                            resolve(parsed.activeModelId || parsed.model || null);
                        } catch (e) {
                            resolve(null);
                        }
                    } else {
                        resolve(null);
                    }
                });
            });

            req.on('error', () => resolve(null));
            req.on('timeout', () => {
                req.destroy();
                resolve(null);
            });
            req.end();
        });
    }
}
