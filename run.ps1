# 작업 스케줄러가 실행하는 파일. 직접 실행해도 됩니다: powershell -ExecutionPolicy Bypass -File run.ps1
Set-Location -Path $PSScriptRoot
node scripts/run.mjs
exit $LASTEXITCODE
