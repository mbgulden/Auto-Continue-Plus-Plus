# Install-DashboardStartup.ps1
# Creates a silent startup script for the Swarm Commander Dashboard and Supervisor Daemon

$workspaceDir = "C:\Users\mbgul\Dropbox\Workshop\Antigravity Orchestration Hub"
$startupFolder = [Environment]::GetFolderPath("Startup")
$vbsPath = "$startupFolder\Start-SwarmCommander.vbs"

$vbsContent = @"
Set objShell = CreateObject("WScript.Shell")
' Start Supervisor Daemon in the background
objShell.Run "cmd /c cd /d `"$workspaceDir\.agents\skills\swarm_orchestrator`" && python supervisor_daemon.py", 0, False

' Start React Dashboard in the background
objShell.Run "cmd /c cd /d `"$workspaceDir\commander-dashboard`" && npm run dev", 0, False
"@

Set-Content -Path $vbsPath -Value $vbsContent

Write-Host "Success: Installed automated startup to Windows Logon folder at:"
Write-Host $vbsPath
Write-Host "The Swarm Commander (Port 5001 & 5173) will now auto-start silently on boot."
