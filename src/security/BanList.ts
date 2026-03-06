import * as vscode from 'vscode';

export class BanList {
    // Default dangerous commands that should never be auto-accepted
    private readonly defaultBannedPatterns: RegExp[] = [
        /rm\s+-rf/i,
        /drop\s+(table|database)/i,
        /delete\s+from/i,
        /apiKey/i,
        /secret/i,
        /password/i,
        /shutdown/i,
        /format\s+[a-z]:/i // Windows format
    ];

    private _userBannedPatterns: string[] = [];

    constructor() {
        this.loadUserConfig();

        // Listen for configuration changes to update the ban list
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('autoContinue.bannedCommands')) {
                this.loadUserConfig();
            }
        });
    }

    /**
     * Loads user-specific banned strings from VS Code settings
     */
    private loadUserConfig() {
        const config = vscode.workspace.getConfiguration('autoContinue');
        this._userBannedPatterns = config.get<string[]>('bannedCommands', []);
    }

    /**
     * Validates if a command is safe to execute automatically.
     * Checks against default regex patterns and user-defined keywords/patterns.
     * 
     * @param command The terminal command or proposed action
     * @returns true if the command contains a banned pattern
     */
    public isBanned(command: string): boolean {
        const lowerCommand = command.toLowerCase();

        // Check defaults
        for (const pattern of this.defaultBannedPatterns) {
            if (pattern.test(lowerCommand)) {
                console.warn(`[Auto-Continue] Command blocked by default pattern: ${pattern}`);
                return true;
            }
        }

        // Check custom user strings/regex
        for (const patternString of this._userBannedPatterns) {
            try {
                const regex = new RegExp(patternString, 'i');
                if (regex.test(lowerCommand)) {
                    console.warn(`[Auto-Continue] Command blocked by user pattern: ${patternString}`);
                    return true;
                }
            } catch (e) {
                // If it's not a valid regex, just do a simple string includes check
                if (lowerCommand.includes(patternString.toLowerCase())) {
                    console.warn(`[Auto-Continue] Command blocked by user keyword: ${patternString}`);
                    return true;
                }
            }
        }

        return false; // Safe
    }
}
