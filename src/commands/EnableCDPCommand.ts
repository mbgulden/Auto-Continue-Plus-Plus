import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { CDPHandler } from '../engine/CDPHandler';

export function registerEnableCDPCommand(
    context: vscode.ExtensionContext,
    cdpHandler: CDPHandler
): vscode.Disposable {
    return vscode.commands.registerCommand('auto-continue.enableCDP', async () => {
        const isActive = await cdpHandler.isCDPAvailable();
        if (isActive) {
            vscode.window.showInformationMessage('Swarm CDP is already active (Port Open). No restart needed.');
            return;
        }

        if (vscode.env.remoteName) {
            vscode.window.showWarningMessage('Auto-Continue: You are connected via Remote SSH. Please manually restart your local VS Code window with the "--remote-debugging-port=9000" flag. Auto-relaunch is not supported remotely.');
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No active workspace available to relaunch.');
            return;
        }

        const appName = vscode.env.appName || 'the editor';
        const isWindows = process.platform === 'win32';
        
        let shortcutStatusMsg = '';
        if (isWindows) {
            try {
                const desktopPath = path.join(os.homedir(), 'Desktop');
                const shortcutPath = path.join(desktopPath, `${appName} (Swarm CDP).lnk`);
                if (!fs.existsSync(shortcutPath)) {
                    await vscode.commands.executeCommand('auto-continue.swarm.createShortcut', true); // Silent mode
                    shortcutStatusMsg = `\nA Swarm Shortcut was automatically generated on your Desktop.\n\n`;
                } else {
                    shortcutStatusMsg = `\n(Booting via your existing Desktop Swarm Shortcut)\n\n`;
                }
            } catch (e) {
                // Ignore silent path errors
            }
        }

        const selection = await vscode.window.showWarningMessage(
            `To enable Swarm CDP, all ${appName} windows must close. ${shortcutStatusMsg}We will safely shut down and automatically reboot into Swarm Mode. Please save your work!`,
            { modal: true },
            'Close & Reboot'
        );
        
        if (selection !== 'Close & Reboot') return;

        const execPath = process.execPath;
        
        if (isWindows) {
            const scriptDir = context.globalStorageUri.fsPath;
            if (!fs.existsSync(scriptDir)) {
                fs.mkdirSync(scriptDir, { recursive: true });
            }
            const ps1Path = path.join(scriptDir, 'swarm_cdp_relauncher.ps1');
            
            const scriptContent = `
param([string]$CodePath)
$CodeName = [System.IO.Path]::GetFileNameWithoutExtension($CodePath)
$timeout = 10
$sw = [Diagnostics.Stopwatch]::StartNew()
while (Get-Process -Name $CodeName -ErrorAction SilentlyContinue) {
    if ($sw.Elapsed.TotalSeconds -gt $timeout) { break }
    Start-Sleep -Milliseconds 500
}
# Start completely detached without any folder argument to trigger global session restore
Start-Process -FilePath $CodePath -ArgumentList '--remote-debugging-port=9000'
`;
            fs.writeFileSync(ps1Path, scriptContent.trim());
            
            const argsList = `'-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-NoProfile', '-File', '${ps1Path}', '-CodePath', '${execPath}'`;
            const launchCmd = `Start-Process -FilePath 'powershell.exe' -ArgumentList ${argsList} -WindowStyle Hidden`;
            
            const child = cp.spawn('powershell.exe', [
                '-ExecutionPolicy', 'Bypass',
                '-WindowStyle', 'Hidden',
                '-NoProfile',
                '-Command', launchCmd
            ], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });
            child.unref();
        } else {
            const scriptDir = context.globalStorageUri.fsPath;
            if (!fs.existsSync(scriptDir)) {
                fs.mkdirSync(scriptDir, { recursive: true });
            }
            const shPath = path.join(scriptDir, 'swarm_cdp_relauncher.sh');
            const scriptContent = `
#!/bin/bash
CODE_PATH="$1"
while pgrep -f "$CODE_PATH" > /dev/null; do
    sleep 0.5
done
"$CODE_PATH" --remote-debugging-port=9000 &
`;
            fs.writeFileSync(shPath, scriptContent.trim(), { mode: 0x777 });
            const child = cp.spawn('sh', ['-c', `nohup "${shPath}" "${execPath}" > /dev/null 2>&1 &`], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
        }

        await vscode.commands.executeCommand('workbench.action.quit');
    });
}
