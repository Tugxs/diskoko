param(
  [string]$RuntimeDirectory = 'D:\GPT 2\diskoko-ai',
  [string]$SiteUrl = 'https://diskoko.com',
  [switch]$DesignPilot = $true,
  [switch]$QualityPlanning
)

$ErrorActionPreference = 'Stop'
$model = Join-Path $RuntimeDirectory 'Qwen3-4B-Q4_K_M.gguf'
$server = Join-Path $RuntimeDirectory 'ollama\lib\ollama\llama-server.exe'
$node = Join-Path $RuntimeDirectory 'node.exe'
$tokenFile = Join-Path $RuntimeDirectory 'worker-token.txt'
$worker = Join-Path $PSScriptRoot 'local-ai-worker.mjs'
foreach ($file in @($model, $server, $node, $tokenFile, $worker)) {
  if (-not (Test-Path -LiteralPath $file)) { throw "Missing local AI file: $file" }
}

$env:AI_WORKER_TOKEN = (Get-Content -LiteralPath $tokenFile -Raw -Encoding ascii).Trim()
$env:AI_MODEL = 'Qwen3-4B-Q4_K_M.gguf'
$env:LOCAL_AI_PROVIDER = 'llama'
$env:LOCAL_AI_URL = 'http://127.0.0.1:11434'
$env:DISKOKO_URL = $SiteUrl

if ($DesignPilot) {
  $capabilities = Invoke-RestMethod -Uri ($SiteUrl.TrimEnd('/') + '/api/ai/worker/capabilities') -Headers @{ Authorization = ('Bearer ' + $env:AI_WORKER_TOKEN) } -TimeoutSec 15
  if ($capabilities.flexibleDesignVersion -ne 1 -or $capabilities.referenceDesignVersion -ne 1 -or -not $capabilities.referenceOnly -or -not $capabilities.durablePublicationReview) { throw 'Deploy the compatible reference-design backend before switching the worker.' }
  $visionModel = Join-Path $RuntimeDirectory 'Qwen3VL-4B-Instruct-Q4_K_M.gguf'
  $visionProjector = Join-Path $RuntimeDirectory 'mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf'
  foreach ($visionFile in @($visionModel, $visionProjector)) { if (-not (Test-Path -LiteralPath $visionFile)) { throw "Missing vision file: $visionFile" } }
  try { $visionHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:11436/health' -TimeoutSec 2 } catch { $visionHealth = $null }
  if ($visionHealth.status -ne 'ok') {
    Start-Process -FilePath $server -WorkingDirectory (Split-Path $server) -ArgumentList @('-m', "`"$visionModel`"", '--mmproj', "`"$visionProjector`"", '-ngl', '99', '--host', '127.0.0.1', '--port', '11436', '-c', '8192', '-np', '1', '--jinja') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $RuntimeDirectory 'vision3.out.log') -RedirectStandardError (Join-Path $RuntimeDirectory 'vision3.err.log')
  }
  for ($visionAttempt = 0; $visionAttempt -lt 90; $visionAttempt++) {
    try { $visionProps = Invoke-RestMethod -Uri 'http://127.0.0.1:11436/props' -TimeoutSec 2; if ($visionProps.modalities.vision -eq $true -and $visionProps.model_alias.EndsWith('Qwen3VL-4B-Instruct-Q4_K_M.gguf')) { break } } catch { }
    Start-Sleep -Seconds 2
  }
  if ($visionAttempt -ge 90) { throw 'Vision model did not become ready.' }
  $env:AI_VISION_MODEL = 'Qwen3VL-4B-Instruct-Q4_K_M.gguf'
  $env:AI_VISION_URL = 'http://127.0.0.1:11436'
  $env:AI_VISION_PROVIDER = 'llama'
  $env:AI_PLANNING_MODEL = $env:AI_VISION_MODEL
  $env:AI_PLANNING_URL = $env:AI_VISION_URL
  $env:AI_PLANNING_PROVIDER = 'llama'
  if ($QualityPlanning) {
    $qualityModel = Join-Path $RuntimeDirectory 'Qwen3-14B-Q5_K_M.gguf'
    if (-not (Test-Path -LiteralPath $qualityModel)) { throw 'Download and verify the optional planning model first.' }
    $qualityProps = Invoke-RestMethod -Uri 'http://127.0.0.1:11438/props' -TimeoutSec 3
    if (-not $qualityProps.model_alias.EndsWith('Qwen3-14B-Q5_K_M.gguf')) { throw 'Start the verified quality planning server on local port 11438 first.' }
    $env:AI_PLANNING_MODEL = 'Qwen3-14B-Q5_K_M.gguf'
    $env:AI_PLANNING_URL = 'http://127.0.0.1:11438'
  }
}

if (-not (Test-NetConnection 127.0.0.1 -Port 11434 -InformationLevel Quiet)) {
  Start-Process -FilePath $server -WorkingDirectory (Split-Path $server) -ArgumentList @('-m', "`"$model`"", '-ngl', '99', '--host', '127.0.0.1', '--port', '11434', '-c', '4096', '-np', '1', '--jinja') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $RuntimeDirectory 'model.out.log') -RedirectStandardError (Join-Path $RuntimeDirectory 'model.err.log')
}

for ($attempt = 0; $attempt -lt 90; $attempt++) {
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/health' -TimeoutSec 2
    if ($health.status -eq 'ok') { break }
  } catch { }
  Start-Sleep -Seconds 2
}
if ($attempt -ge 90) { throw 'Local model did not become healthy within 3 minutes.' }

$embeddingModel = Join-Path $RuntimeDirectory 'Qwen3-Embedding-0.6B-Q8_0.gguf'
if ($DesignPilot -and (Test-Path -LiteralPath $embeddingModel)) {
  try { $embeddingHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:11437/health' -TimeoutSec 2 } catch { $embeddingHealth = $null }
  if ($embeddingHealth.status -ne 'ok') {
    Start-Process -FilePath $server -WorkingDirectory (Split-Path $server) -ArgumentList @('-m', "`"$embeddingModel`"", '--embedding', '--pooling', 'last', '--host', '127.0.0.1', '--port', '11437', '-c', '2048', '-ngl', '0', '-np', '1') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $RuntimeDirectory 'embedding.out.log') -RedirectStandardError (Join-Path $RuntimeDirectory 'embedding.err.log')
  }
  $env:AI_EMBEDDING_URL = 'http://127.0.0.1:11437'
}

$pidFile = Join-Path $RuntimeDirectory 'worker.pid'
$workerPid = if (Test-Path -LiteralPath $pidFile) { (Get-Content -LiteralPath $pidFile -Raw).Trim() } else { '' }
if ($workerPid -and (Get-Process -Id ([int]$workerPid) -ErrorAction SilentlyContinue)) {
  $existingWorker = Get-CimInstance Win32_Process -Filter "ProcessId=$workerPid"
  if (-not $existingWorker.CommandLine.Contains($worker)) { throw 'A different worker is still running. Complete its current request and restart it before activating this release.' }
}
if (-not $workerPid -or -not (Get-Process -Id ([int]$workerPid) -ErrorAction SilentlyContinue)) {
  $process = Start-Process -FilePath $node -ArgumentList @("`"$worker`"") -WorkingDirectory $RuntimeDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $RuntimeDirectory 'worker.out.log') -RedirectStandardError (Join-Path $RuntimeDirectory 'worker.err.log')
  Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii
}
Write-Output 'AI Diskoko local model and worker started.'

