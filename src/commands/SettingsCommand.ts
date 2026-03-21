import * as vscode from 'vscode';

export function registerSettingsCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('auto-continue.settings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'Auto-Continue');
    });
}
