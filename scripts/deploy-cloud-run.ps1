param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Region = "us-central1",

  [string]$ServiceName = "cyberx-project",

  [string]$Repository = "cloud-run",

  [string]$ImageTag = "",

  [switch]$NoAllowUnauthenticated
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$rootEnvPath = Join-Path $repoRoot ".env"
$serverEnvPath = Join-Path $repoRoot "server/.env"

function Read-DotEnv {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing env file: $Path"
  }

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $separatorIndex = $trimmed.IndexOf("=")
    if ($separatorIndex -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1).Trim()

    if (
      $value.Length -ge 2 -and (
        ($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))
      )
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $values[$key] = $value
  }

  return $values
}

function Write-YamlFile {
  param(
    [hashtable]$Values,
    [string]$Path
  )

  $builder = New-Object System.Text.StringBuilder
  foreach ($entry in $Values.GetEnumerator() | Sort-Object Key) {
    $escaped = [string]$entry.Value
    $escaped = $escaped.Replace("'", "''")
    [void]$builder.AppendLine("$($entry.Key): '$escaped'")
  }

  Set-Content -LiteralPath $Path -Value $builder.ToString() -Encoding ascii
}

function Resolve-CommandPath {
  param(
    [string]$Name,
    [string[]]$FallbackPaths = @()
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  foreach ($candidate in $FallbackPaths) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw "Required command not found: $Name"
}

$dockerBin = Resolve-CommandPath -Name "docker"
$gcloudBin = Resolve-CommandPath -Name "gcloud" -FallbackPaths @(
  "C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
  (Join-Path $env:LOCALAPPDATA "Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd")
)

$rootEnv = Read-DotEnv -Path $rootEnvPath
$serverEnv = Read-DotEnv -Path $serverEnvPath

$buildArgKeys = @(
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_OPENROUTER_API_KEY",
  "VITE_OPENROUTER_MODEL",
  "VITE_OPENROUTER_FALLBACK_MODELS",
  "VITE_OPENROUTER_SITE_URL",
  "VITE_OPENROUTER_SITE_TITLE",
  "VITE_OPENROUTER_REQUEST_TIMEOUT_MS",
  "VITE_GOOGLE_MAPS_API_KEY",
  "VITE_LOCATIONIQ_API_KEY"
)

$runtimeEnvKeys = @(
  "JWT_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "OWNER_EMAIL",
  "FRONTEND_ORIGIN"
)

$optionalRuntimeKeys = @("OWNER_EMAIL", "FRONTEND_ORIGIN")
$missingRuntime = @($runtimeEnvKeys | Where-Object { $_ -notin $optionalRuntimeKeys -and [string]::IsNullOrWhiteSpace($serverEnv[$_]) })
if ($missingRuntime.Count -gt 0) {
  throw "Missing required keys in server/.env: $($missingRuntime -join ', ')"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([string]::IsNullOrWhiteSpace($ImageTag)) {
  $ImageTag = $timestamp
}

$imageUri = "$Region-docker.pkg.dev/$ProjectId/$Repository/${ServiceName}:$ImageTag"
$runtimeYaml = Join-Path ([System.IO.Path]::GetTempPath()) "$ServiceName-runtime-$timestamp.yaml"

$runtimeValues = @{
  NODE_ENV = "production"
  TRUST_PROXY = "1"
}

foreach ($key in $runtimeEnvKeys) {
  if (-not [string]::IsNullOrWhiteSpace($serverEnv[$key])) {
    $runtimeValues[$key] = $serverEnv[$key]
  }
}

Write-YamlFile -Values $runtimeValues -Path $runtimeYaml

try {
  Write-Host "Setting active Google Cloud project..."
  & $gcloudBin config set project $ProjectId | Out-Host

  Write-Host "Ensuring Artifact Registry repository exists..."
  & $gcloudBin artifacts repositories describe $Repository --location=$Region 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    & $gcloudBin artifacts repositories create $Repository --repository-format=docker --location=$Region --description="Cloud Run images for $ServiceName" | Out-Host
  }

  Write-Host "Configuring Docker authentication for Artifact Registry..."
  & $gcloudBin auth configure-docker "$Region-docker.pkg.dev" --quiet | Out-Host

  $dockerArgs = @("build", "-t", $imageUri)
  foreach ($key in $buildArgKeys) {
    $value = $rootEnv[$key]
    if ($null -ne $value) {
      $dockerArgs += @("--build-arg", "$key=$value")
    }
  }

  # Single-service Cloud Run deploys should resolve API requests to the current origin.
  $dockerArgs += @("--build-arg", "VITE_API_BASE_URL=")
  $dockerArgs += @("--build-arg", "VITE_SERVER_URL=")
  $dockerArgs += "."

  Write-Host "Building container image..."
  & $dockerBin @dockerArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Docker build failed."
  }

  Write-Host "Pushing image to Artifact Registry..."
  & $dockerBin push $imageUri
  if ($LASTEXITCODE -ne 0) {
    throw "Docker push failed."
  }

  $deployArgs = @(
    "run", "deploy", $ServiceName,
    "--project", $ProjectId,
    "--region", $Region,
    "--image", $imageUri,
    "--port", "8080",
    "--env-vars-file", $runtimeYaml
  )

  if ($NoAllowUnauthenticated) {
    $deployArgs += "--no-allow-unauthenticated"
  } else {
    $deployArgs += "--allow-unauthenticated"
  }

  Write-Host "Deploying to Cloud Run..."
  & $gcloudBin @deployArgs | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Cloud Run deploy failed."
  }

  $serviceUrl = & $gcloudBin run services describe $ServiceName --project $ProjectId --region $Region --format="value(status.url)"
  Write-Host ""
  Write-Host "Deployment complete: $serviceUrl"
}
finally {
  if (Test-Path -LiteralPath $runtimeYaml) {
    Remove-Item -LiteralPath $runtimeYaml -Force
  }
}
