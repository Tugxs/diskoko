param(
  [Parameter(Mandatory=$true)][string]$RuntimeDirectory,
  [string]$SiteUrl='https://diskoko.com',
  [string]$InferenceUrl='http://127.0.0.1:11434'
)
$ErrorActionPreference='Stop'
$taskWorker=Join-Path $PSScriptRoot 'admin-ai-worker.mjs'
$taskRuntime=(Resolve-Path -LiteralPath $RuntimeDirectory).Path
$taskToken=Join-Path $taskRuntime 'worker-token.txt'
if(-not (Test-Path -LiteralPath $taskToken -PathType Leaf)){throw 'The existing AI worker token file is required.'}
$taskHealth=Invoke-RestMethod -Uri ($InferenceUrl+'/health') -TimeoutSec 5
if($taskHealth.status -ne 'ok'){throw 'Start the existing local AI model before starting the administration worker.'}
$taskExisting=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.Contains($taskWorker) }
if($taskExisting){Write-Output 'Administration worker is already running.';exit}
$taskPrevious=@{TOKEN_FILE=$env:AI_WORKER_TOKEN_FILE;SITE=$env:DISKOKO_URL;INFERENCE=$env:LOCAL_AI_URL;PROVIDER=$env:LOCAL_AI_PROVIDER}
try{
 $env:AI_WORKER_TOKEN_FILE=$taskToken;$env:DISKOKO_URL=$SiteUrl;$env:LOCAL_AI_URL=$InferenceUrl;$env:LOCAL_AI_PROVIDER='llama'
 $taskNode=(Get-Command node -ErrorAction Stop).Source
 $taskProcess=Start-Process -FilePath $taskNode -WorkingDirectory (Split-Path $PSScriptRoot) -ArgumentList @('"'+$taskWorker+'"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime 'admin-worker.out.log') -RedirectStandardError (Join-Path $taskRuntime 'admin-worker.err.log')
 Set-Content -LiteralPath (Join-Path $taskRuntime 'admin-worker.pid') -Value $taskProcess.Id -Encoding ascii
 Write-Output ('Administration worker started: '+$taskProcess.Id)
}finally{
 $env:AI_WORKER_TOKEN_FILE=$taskPrevious.TOKEN_FILE;$env:DISKOKO_URL=$taskPrevious.SITE;$env:LOCAL_AI_URL=$taskPrevious.INFERENCE;$env:LOCAL_AI_PROVIDER=$taskPrevious.PROVIDER
}
