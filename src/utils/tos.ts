import * as vscode from 'vscode';

/**
 * Validates the Global Terms of Service at extension startup.
 * @param context The extension context to read global state from.
 * @returns {Promise<boolean>} True if the user consented, false otherwise.
 */
export async function checkGlobalTOS(context: vscode.ExtensionContext): Promise<boolean> {
    const TOS_KEY = 'autoContinue.globalTOSAgreed';
    const hasAgreed = context.globalState.get<boolean>(TOS_KEY, false);

    if (hasAgreed) return true;

    // Extract dynamic version from package.json
    const extensionVersion = context.extension.packageJSON.version || "Unknown";

    const tosMessage = `[Auto-Continue Plus Plus v${extensionVersion}] By using this extension, you acknowledge that it actively automates AI actions, automatically accepts diffs on your behalf, and seamlessly synchronizes AI conversation data across your workspace to support multi-environment roaming. The author is not liable for data loss or unintended AI agent behavior. Do you agree to these terms?`;

    const selection = await vscode.window.showWarningMessage(tosMessage, "I Agree", "Decline");

    if (selection === "I Agree") {
        await context.globalState.update(TOS_KEY, true);
        return true;
    }

    // User declined
    vscode.window.showWarningMessage("Auto-Continue Plus Plus requires TOS acceptance to function. The extension will remain paused and idle.");
    return false;
}
