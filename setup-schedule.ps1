# 매일 정해진 시간에 자동 발행하도록 Windows 작업 스케줄러에 등록합니다.
# 사용법: powershell -ExecutionPolicy Bypass -File setup-schedule.ps1 -Time 09:00
# 해제:   Unregister-ScheduledTask -TaskName NaverBlogAgent -Confirm:$false
param(
    [string]$Time = "09:00",
    [int]$RandomDelayMinutes = 30
)

$taskName = "NaverBlogAgent"
$script = Join-Path $PSScriptRoot "run.ps1"

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`"" `
    -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $Time -RandomDelay (New-TimeSpan -Minutes $RandomDelayMinutes)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

# 로그인한 사용자 세션에서 실행 (브라우저가 떠야 하므로)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "등록 완료: 매일 $Time (+최대 $RandomDelayMinutes 분) 에 자동 발행합니다." -ForegroundColor Green
Write-Host "지금 바로 시험하려면: Start-ScheduledTask -TaskName $taskName"
