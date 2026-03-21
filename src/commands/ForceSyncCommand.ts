import * as vscode from 'vscode';
import { SyncEngine } from '../engine/SyncEngine';

export function registerForceSyncCommand(
    context: vscode.ExtensionContext,
    syncEngine: SyncEngine
): vscode.Disposable {
    return vscode.commands.registerCommand('auto-continue.forceSync', async () => {
        if (!context.globalState.get('autoContinue.globalTOSAgreed', false)) {
            vscode.window.showErrorMessage('You must agree to the Terms of Service to sync.');
            return;
        }
        await syncEngine.runContinuousSync();
        vscode.window.showInformationMessage('Auto-Continue Sync: Bidirectional sync complete.');
    });
}
