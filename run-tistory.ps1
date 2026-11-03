# 작업 스케줄러가 실행하는 티스토리 발행 파일. 직접 실행해도 됩니다: powershell -ExecutionPolicy Bypass -File run-tistory.ps1
Set-Location -Path $PSScriptRoot
node scripts/run.mjs --tistory
exit $LASTEXITCODE