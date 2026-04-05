Write-Host "=========================================="
Write-Host "⚔️ Antigravity Developer Mode Initiated ⚔️"
Write-Host "=========================================="
Write-Host "Neutralizing Globally Installed Hub Daemons..."

# Function to kill process by port gracefully
function Kill-Port($port) {
    $processes = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($processes) {
        foreach ($proc in $processes) {
            $id = $proc.OwningProcess
            if ($id -ne 0 -and $id -ne 4) {
                Write-Host "=> Targeting Zombie Process (PID: $id) on Port $port"
                Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
                Write-Host "=> Extinguished Port $port"
            }
        }
    } else {
        Write-Host "=> Port $port is already clear."
    }
}

Kill-Port 5001
Kill-Port 5173

Write-Host "------------------------------------------"
Write-Host "Ports are clear! You may now run your local development versions."
Write-Host "------------------------------------------"
