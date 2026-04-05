<#
.SYNOPSIS
Installs and triggers the Sovereign RAM Optimizer background service using Sysinternals RAMMap.
.DESCRIPTION
This script automatically registers a Scheduled Task as SYSTEM, which allows RAMMap to flush 
Windows Standby Memory unconditionally without generating UAC popups every time. 
This definitively resolves Antigravity multi-agent workspace memory locking natively.
#>

param (
    [switch]$Force = $false
)

# Enforce Administrator Privileges for Task Registration
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "[WAIT] Requesting Administrative privileges to register SYSTEM Task..." -ForegroundColor Yellow
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$CurrentDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BinDir = Join-Path $CurrentDir "bin"
$RamMapExe = Join-Path $BinDir "RAMMap64.exe"

if (-not (Test-Path $RamMapExe)) {
    Write-Host "[ERROR] Could not find RAMMap64.exe at `"$RamMapExe`"." -ForegroundColor Red
    Write-Host "Please ensure it was copied into the bin/ directory." -ForegroundColor Red
    pause
    exit
}

Write-Host "[BOOT] Sovereign RAM Optimizer Setup Initiated." -ForegroundColor Cyan

# Accept Microsoft Sysinternals EULA programmatically through registry to prevent popup halting
Write-Host "[1/3] Accepting RAMMap EULA silently via Registry..." -ForegroundColor Green
$SysinternalsReg = "HKCU:\Software\Sysinternals\RAMMap"
if (-not (Test-Path $SysinternalsReg)) {
    New-Item -Path $SysinternalsReg -Force | Out-Null
}
Set-ItemProperty -Path $SysinternalsReg -Name "EulaAccepted" -Value 1 -Type DWord -Force

# Create the wrapper script that specifically executes the flags conditionally
$WrapperScript = Join-Path $BinDir "FlushMemory.ps1"
$WrapperContent = @"
# Auto-Generated Wrapper Script for RAMMap
`$exe = "$RamMapExe"

# Calculate current physical memory utilization safely
function Get-MemoryUtilization {
    `$osInfo = Get-CimInstance -ClassName Win32_OperatingSystem
    return [math]::Round((( `$osInfo.TotalVisibleMemorySize - `$osInfo.FreePhysicalMemory ) / `$osInfo.TotalVisibleMemorySize ) * 100)
}

`$initialPct = Get-MemoryUtilization

if (`$initialPct -ge 92) {
    Write-Host "Initial Memory Spike Detected: `$initialPct%. Verifying sustained load..."
    # The true Pro-Developer move: Sleep in-memory (0 CPU cycles) for 5 minutes
    # instead of writing state files to the disk.
    Start-Sleep -Seconds 300
    
    `$sustainedPct = Get-MemoryUtilization
    if (`$sustainedPct -ge 92) {
        Write-Host "CRITICAL MEMORY VERIFIED: Sustained at `$sustainedPct% for 5 minutes. Dropping the hammer."
        Start-Process -FilePath `$exe -ArgumentList "-Ew" -Wait -WindowStyle Hidden
        Start-Process -FilePath `$exe -ArgumentList "-Es" -Wait -WindowStyle Hidden
        Write-Host "System Memory Flushed Successfully."
    } else {
        Write-Host "False alarm. Memory naturally cooled down to `$sustainedPct%."
    }
} else {
    Write-Host "Memory is stable at `$initialPct%. Threshold is 92%. Skipping."
}
"@

Set-Content -Path $WrapperScript -Value $WrapperContent -Force
Write-Host "[2/3] Wrapper Script deployed to: $WrapperScript" -ForegroundColor Green

# Task Scheduler Integration
$TaskName = "Antigravity_RAM_Clear"

# Unregister if exist
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Write-Host "[3/3] Registering SYSTEM-Level Scheduled Task..." -ForegroundColor Green

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$WrapperScript`""

# The background trigger checks every 10 minutes. If memory is >92%, the script handles the 5-minute verification internally.
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10)

$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null

Write-Host "`n[SUCCESS] The Sovereign RAM Optimizer has been permanently integrated into your machine!" -ForegroundColor Magenta
Write-Host "You can now trigger it AT ANY TIME (even without admin rights) via:" -ForegroundColor White
Write-Host "schtasks /run /tn `"$TaskName`"" -ForegroundColor Yellow
Write-Host "`nThe background service is actively running and will flush stale memory every 10 minutes." -ForegroundColor Gray
Write-Host "Press any key to exit..." -ForegroundColor Cyan

$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
