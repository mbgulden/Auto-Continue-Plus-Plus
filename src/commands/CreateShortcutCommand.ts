import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export function registerCreateShortcutCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('auto-continue.swarm.createShortcut', async (silent: boolean = false) => {
        const isWindows = process.platform === 'win32';
        if (!isWindows) {
            if (!silent) vscode.window.showErrorMessage('Desktop Shortcut creation is currently only supported on Windows.');
            return;
        }

        const appName = vscode.env.appName || 'Antigravity';
        const execPath = process.execPath;
        
        try {
            const scriptPath = path.join(os.tmpdir(), `create_shortcut_${Date.now()}.ps1`);
            const psScript = `
$WshShell = New-Object -comObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\\${appName} (Swarm CDP).lnk")
$Shortcut.TargetPath = "${execPath}"
$Shortcut.Arguments = "--remote-debugging-port=9000"
$Shortcut.IconLocation = "${execPath}, 0"
$Shortcut.Save()
`;
            fs.writeFileSync(scriptPath, psScript.trim());
            cp.execSync(`powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${scriptPath}"`);
            fs.unlinkSync(scriptPath);
            
            if (!silent) {
                vscode.window.showInformationMessage(`Successfully created "${appName} (Swarm CDP)" shortcut on your Desktop! Use this to always launch with Swarm mode enabled.`);
            }
        } catch (e: any) {
            if (!silent) vscode.window.showErrorMessage(`Failed to create shortcut: ${e.message}`);
        }
    });
}
