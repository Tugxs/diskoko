param([string]$RuntimeDirectory='D:\GPT 2\diskoko-ai',[string]$SiteUrl='https://diskoko.com')
$ErrorActionPreference='Stop'
$taskNode=Join-Path $RuntimeDirectory 'node.exe'
$taskToken=Join-Path $RuntimeDirectory 'worker-token.txt'
$taskWorker=Join-Path $PSScriptRoot 'code-ai-worker.mjs'
$taskPidFile=Join-Path $RuntimeDirectory 'code-worker.pid'
if(Test-Path -LiteralPath $taskPidFile){$taskPid=[int](Get-Content -LiteralPath $taskPidFile -Raw);if(Get-Process -Id $taskPid -ErrorAction SilentlyContinue){$taskExisting=Get-CimInstance Win32_Process -Filter "ProcessId=$taskPid";if($taskExisting.CommandLine.Contains($taskWorker)){Write-Output 'Code AI worker is already running.';exit}}}
$env:AI_WORKER_TOKEN=(Get-Content -LiteralPath $taskToken -Raw -Encoding ascii).Trim()
$env:DISKOKO_URL=$SiteUrl
$env:LOCAL_AI_URL='http://127.0.0.1:11434'
$env:AI_MODEL='Qwen3-4B-Q4_K_M.gguf'
try{$taskHealth=Invoke-RestMethod 'http://127.0.0.1:11434/health' -TimeoutSec 3}catch{$taskHealth=$null}
if($taskHealth.status -ne 'ok'){
  $taskModel=Join-Path $RuntimeDirectory 'Qwen3-4B-Q4_K_M.gguf'
  $taskServer=Join-Path $RuntimeDirectory 'ollama\lib\ollama\llama-server.exe'
  foreach($taskFile in @($taskModel,$taskServer,$taskNode)){if(-not(Test-Path -LiteralPath $taskFile)){throw "Missing runtime file: $taskFile"}}
  Start-Process -FilePath $taskServer -WorkingDirectory (Split-Path $taskServer) -ArgumentList @('-m',"`"$taskModel`"",'-ngl','99','--host','127.0.0.1','--port','11434','-c','8192','-np','1','--jinja') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $RuntimeDirectory 'code-model.out.log') -RedirectStandardError (Join-Path $RuntimeDirectory 'code-model.err.log')
  for($taskAttempt=0;$taskAttempt -lt 60;$taskAttempt++){
    Start-Sleep -Seconds 2
    try{$taskHealth=Invoke-RestMethod 'http://127.0.0.1:11434/health' -TimeoutSec 2;if($taskHealth.status -eq 'ok'){break}}catch{}
  }
  if($taskHealth.status -ne 'ok'){throw 'Local model did not start. Check code-model.err.log.'}
}
$taskProcess=Start-Process -FilePath $taskNode -ArgumentList @("`"$taskWorker`"") -WorkingDirectory $RuntimeDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $RuntimeDirectory 'code-worker.out.log') -RedirectStandardError (Join-Path $RuntimeDirectory 'code-worker.err.log')
$taskProcess.Id | Set-Content -LiteralPath $taskPidFile
Write-Output 'Code AI worker started.'
