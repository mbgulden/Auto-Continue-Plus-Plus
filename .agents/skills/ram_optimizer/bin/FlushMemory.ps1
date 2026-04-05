# Auto-Generated Wrapper Script for RAMMap
$exe = "C:\Users\mbgul\Dropbox\Workshop\Antigravity Orchestration Hub\.agents\skills\ram_optimizer\bin\RAMMap64.exe"
Write-Host "Flushing Working Sets..."
Start-Process -FilePath $exe -ArgumentList "-Ew" -Wait -WindowStyle Hidden
Write-Host "Flushing Standby List..."
Start-Process -FilePath $exe -ArgumentList "-Es" -Wait -WindowStyle Hidden
