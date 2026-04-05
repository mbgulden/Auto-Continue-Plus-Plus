import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

export function registerRAMFlushCommand(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.commands.registerCommand('auto-continue.ram.flush', async () => {
        const taskName = "Antigravity_RAM_Clear";
        
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Antigravity Optimizer",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Flushing Standby Memory Cache..." });

            return new Promise<void>((resolve) => {
                cp.exec(`schtasks /run /tn "${taskName}"`, (error, stdout, stderr) => {
                    if (error) {
                        // The user probably hasn't installed the scheduled task yet.
                        vscode.window.showWarningMessage('Please install the RAM Optimizer first by running `Install-RAMOptimizer.ps1` from the .agents/skills/ram_optimizer directory as Administrator.', 'Copy Path').then(selection => {
                            if (selection === 'Copy Path') {
                                const p = path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', '.agents', 'skills', 'ram_optimizer', 'Install-RAMOptimizer.ps1');
                                vscode.env.clipboard.writeText(p);
                            }
                        });
                        console.error(`Failed to flush RAM: ${error.message}`);
                    } else {
                        vscode.window.showInformationMessage('System Standby Memory has been successfully flushed.');
                    }
                    setTimeout(resolve, 1500); // UI breathing room
                });
            });
        });
    });
}
