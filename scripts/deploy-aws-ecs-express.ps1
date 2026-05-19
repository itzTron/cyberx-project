param(
  [string]$Region = "us-east-1",

  [string]$ServiceName = "cyberx-project",

  [string]$RepositoryName = "cyberx-project",

  [string]$ClusterName = "default",

  [string]$ImageTag = "",

  [string]$AwsProfile = "",

  [string]$ExecutionRoleName = "ecsTaskExecutionRole",

  [string]$InfrastructureRoleName = "ecsInfrastructureRoleForExpressServices",

  [string]$Cpu = "1",

  [string]$Memory = "2",

  [int]$MinTaskCount = 1,

  [int]$MaxTaskCount = 2,

  [string]$FrontendOrigin = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$rootEnvPath = Join-Path $repoRoot ".env"
$serverEnvPath = Join-Path $repoRoot "server/.env"

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
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  throw "Required command not found: $Name"
}

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

function Write-JsonFile {
  param(
    [Parameter(Mandatory = $true)]
    $Value,

    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $json = $Value | ConvertTo-Json -Depth 20
  Set-Content -LiteralPath $Path -Value $json -Encoding ascii
}

function Invoke-Aws {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,

    [switch]$CaptureJson,

    [switch]$IgnoreExitCode
  )

  $fullArguments = @()
  if (-not [string]::IsNullOrWhiteSpace($AwsProfile)) {
    $fullArguments += @("--profile", $AwsProfile)
  }

  $fullArguments += @("--region", $Region, "--no-cli-pager")
  $fullArguments += $Arguments

  if ($CaptureJson) {
    $fullArguments += @("--output", "json")
    $output = & $awsBin @fullArguments 2>&1
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
      if ($IgnoreExitCode) {
        return $null
      }

      throw "AWS command failed: aws $($Arguments -join ' ')`n$output"
    }

    if (-not $output) {
      return $null
    }

    return ($output | ConvertFrom-Json)
  }

  & $awsBin @fullArguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0 -and -not $IgnoreExitCode) {
    throw "AWS command failed: aws $($Arguments -join ' ')"
  }
}

function Invoke-Docker {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & $dockerBin @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Docker command failed: docker $($Arguments -join ' ')"
  }
}

function New-TempJsonPath {
  return (Join-Path ([System.IO.Path]::GetTempPath()) ("{0}.json" -f [System.IO.Path]::GetRandomFileName()))
}

function Ensure-Role {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RoleName,

    [Parameter(Mandatory = $true)]
    [hashtable]$TrustPolicy,

    [Parameter(Mandatory = $true)]
    [string[]]$ManagedPolicyArns
  )

  $role = Invoke-Aws -Arguments @("iam", "get-role", "--role-name", $RoleName) -CaptureJson -IgnoreExitCode
  if (-not $role) {
    $trustPolicyPath = New-TempJsonPath
    try {
      Write-JsonFile -Value $TrustPolicy -Path $trustPolicyPath
      Write-Host "Creating IAM role $RoleName..."
      Invoke-Aws -Arguments @(
        "iam", "create-role",
        "--role-name", $RoleName,
        "--assume-role-policy-document", "file://$trustPolicyPath"
      ) | Out-Null
    }
    finally {
      if (Test-Path -LiteralPath $trustPolicyPath) {
        Remove-Item -LiteralPath $trustPolicyPath -Force
      }
    }
  }

  $attachedPolicies = Invoke-Aws -Arguments @(
    "iam", "list-attached-role-policies",
    "--role-name", $RoleName
  ) -CaptureJson

  $attachedPolicyArns = @($attachedPolicies.AttachedPolicies | ForEach-Object { $_.PolicyArn })
  foreach ($policyArn in $ManagedPolicyArns) {
    if ($policyArn -notin $attachedPolicyArns) {
      Write-Host "Attaching $policyArn to $RoleName..."
      Invoke-Aws -Arguments @(
        "iam", "attach-role-policy",
        "--role-name", $RoleName,
        "--policy-arn", $policyArn
      ) | Out-Null
    }
  }

  Start-Sleep -Seconds 3

  $role = Invoke-Aws -Arguments @("iam", "get-role", "--role-name", $RoleName) -CaptureJson
  return $role.Role.Arn
}

function Ensure-SecretsAccessPolicy {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RoleName,

    [Parameter(Mandatory = $true)]
    [string[]]$SecretArns
  )

  if ($SecretArns.Count -eq 0) {
    return
  }

  $policyDocument = @{
    Version = "2012-10-17"
    Statement = @(
      @{
        Effect = "Allow"
        Action = @("secretsmanager:GetSecretValue")
        Resource = $SecretArns
      }
    )
  }

  $policyPath = New-TempJsonPath
  try {
    Write-JsonFile -Value $policyDocument -Path $policyPath
    Invoke-Aws -Arguments @(
      "iam", "put-role-policy",
      "--role-name", $RoleName,
      "--policy-name", "$ServiceName-EcsSecretsAccess",
      "--policy-document", "file://$policyPath"
    ) | Out-Null
  }
  finally {
    if (Test-Path -LiteralPath $policyPath) {
      Remove-Item -LiteralPath $policyPath -Force
    }
  }
}

function Ensure-EcrRepository {
  param([string]$Name)

  $existing = Invoke-Aws -Arguments @(
    "ecr", "describe-repositories",
    "--repository-names", $Name
  ) -CaptureJson -IgnoreExitCode

  if ($existing) {
    return
  }

  Write-Host "Creating ECR repository $Name..."
  Invoke-Aws -Arguments @(
    "ecr", "create-repository",
    "--repository-name", $Name,
    "--image-scanning-configuration", "scanOnPush=true"
  ) | Out-Null
}

function Ensure-Secret {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $secret = Invoke-Aws -Arguments @(
    "secretsmanager", "describe-secret",
    "--secret-id", $Name
  ) -CaptureJson -IgnoreExitCode

  if ($secret) {
    Invoke-Aws -Arguments @(
      "secretsmanager", "update-secret",
      "--secret-id", $Name,
      "--secret-string", $Value
    ) | Out-Null

    return $secret.ARN
  }

  $created = Invoke-Aws -Arguments @(
    "secretsmanager", "create-secret",
    "--name", $Name,
    "--secret-string", $Value
  ) -CaptureJson

  return $created.ARN
}

function Get-PublicEndpoint {
  param([Parameter(Mandatory = $true)]$ServiceDescription)

  $configurations = @($ServiceDescription.service.activeConfigurations)
  foreach ($configuration in $configurations) {
    $ingressPaths = @($configuration.ingressPaths)
    foreach ($ingressPath in $ingressPaths) {
      if ($ingressPath.accessType -eq "PUBLIC" -and -not [string]::IsNullOrWhiteSpace($ingressPath.endpoint)) {
        $endpoint = $ingressPath.endpoint.Trim()
        if ($endpoint -notmatch '^https?://') {
          $endpoint = "https://$endpoint"
        }

        return $endpoint
      }
    }
  }

  return ""
}

$dockerBin = Resolve-CommandPath -Name "docker"
$awsBin = Resolve-CommandPath -Name "aws" -FallbackPaths @(
  "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
)

$rootEnv = Read-DotEnv -Path $rootEnvPath
$serverEnv = Read-DotEnv -Path $serverEnvPath

$requiredServerKeys = @(
  "JWT_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM"
)

$missingServerKeys = @(
  $requiredServerKeys | Where-Object { [string]::IsNullOrWhiteSpace($serverEnv[$_]) }
)
if ($missingServerKeys.Count -gt 0) {
  throw "Missing required keys in server/.env: $($missingServerKeys -join ', ')"
}

$identity = Invoke-Aws -Arguments @("sts", "get-caller-identity") -CaptureJson
$accountId = [string]$identity.Account

if ([string]::IsNullOrWhiteSpace($ImageTag)) {
  $ImageTag = Get-Date -Format "yyyyMMdd-HHmmss"
}

$registryHost = "$accountId.dkr.ecr.$Region.amazonaws.com"
$imageUri = "$registryHost/$RepositoryName:$ImageTag"
$serviceArn = "arn:aws:ecs:$Region:$accountId:service/$ClusterName/$ServiceName"

Write-Host "Using AWS account $accountId in region $Region."

Ensure-EcrRepository -Name $RepositoryName

Write-Host "Logging Docker into Amazon ECR..."
$ecrLoginArguments = @()
if (-not [string]::IsNullOrWhiteSpace($AwsProfile)) {
  $ecrLoginArguments += @("--profile", $AwsProfile)
}

$ecrLoginArguments += @("--region", $Region, "--no-cli-pager", "ecr", "get-login-password")
$ecrPassword = & $awsBin @ecrLoginArguments
if ($LASTEXITCODE -ne 0) {
  throw "Failed to get Amazon ECR login password."
}

$ecrPassword | & $dockerBin login --username AWS --password-stdin $registryHost
if ($LASTEXITCODE -ne 0) {
  throw "Docker login to Amazon ECR failed."
}

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

$dockerArgs = @("build", "-t", $imageUri)
foreach ($key in $buildArgKeys) {
  $value = $rootEnv[$key]
  if ($null -ne $value) {
    $dockerArgs += @("--build-arg", "$key=$value")
  }
}

# Single-service deployments resolve API calls against the current public origin.
$dockerArgs += @("--build-arg", "VITE_API_BASE_URL=")
$dockerArgs += @("--build-arg", "VITE_SERVER_URL=")
$dockerArgs += "."

Write-Host "Building container image $imageUri..."
Invoke-Docker -Arguments $dockerArgs

Write-Host "Pushing container image to Amazon ECR..."
Invoke-Docker -Arguments @("push", $imageUri)

$taskExecutionTrustPolicy = @{
  Version = "2012-10-17"
  Statement = @(
    @{
      Effect = "Allow"
      Principal = @{
        Service = "ecs-tasks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }
  )
}

$infrastructureTrustPolicy = @{
  Version = "2012-10-17"
  Statement = @(
    @{
      Sid = "AllowAccessInfrastructureForECSExpressServices"
      Effect = "Allow"
      Principal = @{
        Service = "ecs.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }
  )
}

$executionRoleArn = Ensure-Role -RoleName $ExecutionRoleName -TrustPolicy $taskExecutionTrustPolicy -ManagedPolicyArns @(
  "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
)

$infrastructureRoleArn = Ensure-Role -RoleName $InfrastructureRoleName -TrustPolicy $infrastructureTrustPolicy -ManagedPolicyArns @(
  "arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices"
)

$plainRuntimeValues = [ordered]@{
  NODE_ENV = "production"
  TRUST_PROXY = "1"
  PORT = "8080"
  SUPABASE_URL = $serverEnv["SUPABASE_URL"]
  SMTP_HOST = $serverEnv["SMTP_HOST"]
  SMTP_PORT = $serverEnv["SMTP_PORT"]
  SMTP_SECURE = $serverEnv["SMTP_SECURE"]
  SMTP_FROM = $serverEnv["SMTP_FROM"]
}

if (-not [string]::IsNullOrWhiteSpace($serverEnv["OWNER_EMAIL"])) {
  $plainRuntimeValues["OWNER_EMAIL"] = $serverEnv["OWNER_EMAIL"]
}

$resolvedFrontendOrigin = if (-not [string]::IsNullOrWhiteSpace($FrontendOrigin)) {
  $FrontendOrigin.Trim()
} else {
  if ($null -ne $serverEnv["FRONTEND_ORIGIN"]) {
    $serverEnv["FRONTEND_ORIGIN"].Trim()
  } else {
    ""
  }
}

if (-not [string]::IsNullOrWhiteSpace($resolvedFrontendOrigin)) {
  $plainRuntimeValues["FRONTEND_ORIGIN"] = $resolvedFrontendOrigin
}

$secretRuntimeKeys = @(
  "JWT_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SMTP_USER",
  "SMTP_PASS"
)

$containerSecrets = New-Object System.Collections.Generic.List[object]
$secretArns = New-Object System.Collections.Generic.List[string]

foreach ($key in $secretRuntimeKeys) {
  $secretName = "$ServiceName/runtime/$key"
  Write-Host "Syncing Secrets Manager secret $secretName..."
  $secretArn = Ensure-Secret -Name $secretName -Value $serverEnv[$key]
  $secretArns.Add($secretArn)
  $containerSecrets.Add(@{
    name = $key
    valueFrom = $secretArn
  })
}

Ensure-SecretsAccessPolicy -RoleName $ExecutionRoleName -SecretArns @($secretArns)

$containerEnvironment = New-Object System.Collections.Generic.List[object]
foreach ($entry in $plainRuntimeValues.GetEnumerator()) {
  if (-not [string]::IsNullOrWhiteSpace([string]$entry.Value)) {
    $containerEnvironment.Add(@{
      name = [string]$entry.Key
      value = [string]$entry.Value
    })
  }
}

$primaryContainer = @{
  image = $imageUri
  containerPort = 8080
  environment = @($containerEnvironment)
  secrets = @($containerSecrets)
}

$scalingTarget = @{
  minTaskCount = $MinTaskCount
  maxTaskCount = $MaxTaskCount
  autoScalingMetric = "AVERAGE_CPU"
  autoScalingTargetValue = 60
}

$createOrUpdatePayloadPath = New-TempJsonPath
try {
  $existingService = Invoke-Aws -Arguments @(
    "ecs", "describe-express-gateway-service",
    "--service-arn", $serviceArn
  ) -CaptureJson -IgnoreExitCode

  if ($existingService) {
    Write-Host "Updating existing ECS Express Mode service $ServiceName..."
    $updatePayload = @{
      serviceArn = $serviceArn
      executionRoleArn = $executionRoleArn
      healthCheckPath = "/health"
      primaryContainer = $primaryContainer
      cpu = $Cpu
      memory = $Memory
      scalingTarget = $scalingTarget
    }

    Write-JsonFile -Value $updatePayload -Path $createOrUpdatePayloadPath
    Invoke-Aws -Arguments @(
      "ecs", "update-express-gateway-service",
      "--cli-input-json", "file://$createOrUpdatePayloadPath",
      "--monitor-resources", "DEPLOYMENT",
      "--monitor-mode", "TEXT-ONLY"
    ) | Out-Null
  } else {
    Write-Host "Creating ECS Express Mode service $ServiceName..."
    $createPayload = @{
      executionRoleArn = $executionRoleArn
      infrastructureRoleArn = $infrastructureRoleArn
      serviceName = $ServiceName
      cluster = $ClusterName
      healthCheckPath = "/health"
      primaryContainer = $primaryContainer
      cpu = $Cpu
      memory = $Memory
      scalingTarget = $scalingTarget
    }

    Write-JsonFile -Value $createPayload -Path $createOrUpdatePayloadPath
    Invoke-Aws -Arguments @(
      "ecs", "create-express-gateway-service",
      "--cli-input-json", "file://$createOrUpdatePayloadPath",
      "--monitor-resources", "DEPLOYMENT",
      "--monitor-mode", "TEXT-ONLY"
    ) | Out-Null
  }
}
finally {
  if (Test-Path -LiteralPath $createOrUpdatePayloadPath) {
    Remove-Item -LiteralPath $createOrUpdatePayloadPath -Force
  }
}

$serviceDescription = Invoke-Aws -Arguments @(
  "ecs", "describe-express-gateway-service",
  "--service-arn", $serviceArn
) -CaptureJson

$serviceUrl = Get-PublicEndpoint -ServiceDescription $serviceDescription

Write-Host ""
Write-Host "AWS deployment complete."
Write-Host "Service ARN: $serviceArn"
if (-not [string]::IsNullOrWhiteSpace($serviceUrl)) {
  Write-Host "Service URL: $serviceUrl"
}
