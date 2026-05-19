# AWS deployment with ECS Express Mode

This repository is a good fit for a single-container AWS deployment:

- Vite builds the frontend into `dist/`
- `server/index.js` serves both the API and the built SPA
- the frontend falls back to the current origin in production, so one public URL works cleanly

## Why this uses ECS Express Mode

AWS App Runner is no longer the safe default here.

- AWS App Runner was closed to new customers on **April 30, 2026**
- AWS now points new deployments toward **Amazon ECS Express Mode**

Official references:

- App Runner availability change: https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html
- ECS Express Mode overview: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html
- ECS Express Mode CLI walkthrough: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-getting-started.html

## What the helper script does

Use:

```powershell
.\scripts\deploy-aws-ecs-express.ps1 -Region us-east-1
```

Optional parameters:

```powershell
.\scripts\deploy-aws-ecs-express.ps1 `
  -Region us-east-1 `
  -AwsProfile my-profile `
  -ServiceName cyberx-project `
  -RepositoryName cyberx-project `
  -ClusterName default `
  -Cpu 1 `
  -Memory 2 `
  -MinTaskCount 1 `
  -MaxTaskCount 2
```

The script:

- reads frontend build variables from root `.env`
- reads backend runtime variables from `server/.env`
- builds the Docker image locally
- creates the Amazon ECR repository if needed
- pushes the image to ECR
- creates the required ECS IAM roles if they do not already exist
- stores sensitive backend values in AWS Secrets Manager
- creates or updates an ECS Express Mode service
- prints the final service URL when the deployment completes

## Prerequisites

- Docker Desktop
- AWS CLI v2
- an AWS account with permissions for:
  - ECR
  - ECS
  - IAM role creation and `iam:PassRole`
  - Secrets Manager
  - EC2 networking resources that ECS Express Mode manages on your behalf

Authenticate AWS CLI before running the script.

Default profile:

```powershell
aws login
```

Named profile:

```powershell
aws login --profile my-profile
```

## Environment mapping

### Build-time values from root `.env`

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_OPENROUTER_API_KEY`
- `VITE_OPENROUTER_MODEL`
- `VITE_OPENROUTER_FALLBACK_MODELS`
- `VITE_OPENROUTER_SITE_URL`
- `VITE_OPENROUTER_SITE_TITLE`
- `VITE_OPENROUTER_REQUEST_TIMEOUT_MS`
- `VITE_GOOGLE_MAPS_API_KEY`
- `VITE_LOCATIONIQ_API_KEY`

The script intentionally forces:

- `VITE_API_BASE_URL=`
- `VITE_SERVER_URL=`

That keeps the deployed frontend on same-origin API calls.

### Runtime values from `server/.env`

Plain environment variables:

- `NODE_ENV=production`
- `TRUST_PROXY=1`
- `PORT=8080`
- `SUPABASE_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_FROM`
- optional `OWNER_EMAIL`
- optional `FRONTEND_ORIGIN`

Secrets stored in AWS Secrets Manager and injected into the container:

- `JWT_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_USER`
- `SMTP_PASS`

## AWS resources created or reused

- Amazon ECR repository: `<RepositoryName>`
- IAM role: `ecsTaskExecutionRole` by default
- IAM role: `ecsInfrastructureRoleForExpressServices` by default
- AWS Secrets Manager secrets:
  - `<ServiceName>/runtime/JWT_SECRET`
  - `<ServiceName>/runtime/SUPABASE_SERVICE_ROLE_KEY`
  - `<ServiceName>/runtime/SMTP_USER`
  - `<ServiceName>/runtime/SMTP_PASS`
- ECS Express Mode service: `<ServiceName>`

## Important notes

- The script assumes `ClusterName` is the ECS cluster short name. The default is `default`.
- The application must listen on port `8080` in AWS. The script injects `PORT=8080` for that reason.
- `FRONTEND_ORIGIN` is optional for this one-URL deployment because same-host requests are already allowed by `server/index.js`.

## Security note about the current app

`VITE_OPENROUTER_API_KEY` is a frontend build variable and is currently used directly in browser code under `src/lib/repoAgent.ts`.

That means any deployed build exposes the OpenRouter key to end users. Deploying as-is preserves current behavior, but it is not appropriate for a private or paid model key. The correct long-term fix is to move OpenRouter calls behind a server endpoint and keep the key server-side only.
