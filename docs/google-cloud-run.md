# Google Cloud Run deployment

This repository can be deployed to **Google Cloud Run** as a single service:

- Vite builds the frontend into `dist/`
- `server/index.js` serves the API and the built SPA together
- the frontend falls back to the current origin in production, so a single Cloud Run URL works cleanly

## Prerequisites

- Google Cloud SDK (`gcloud`)
- Docker
- a Google Cloud project with billing enabled
- these APIs enabled:
  - `run.googleapis.com`
  - `artifactregistry.googleapis.com`

## Install the CLI on Windows

```powershell
winget install --id Google.CloudSDK --source winget
```

Then open a fresh shell and authenticate:

```powershell
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

## Recommended deployment path

Use the helper script:

```powershell
.\scripts\deploy-cloud-run.ps1 -ProjectId YOUR_PROJECT_ID -Region us-central1 -ServiceName cyberx-project
```

The script:

- reads frontend build variables from root `.env`
- reads backend runtime variables from `server/.env`
- builds the container locally with Docker
- pushes it to Artifact Registry
- deploys the image to Cloud Run with `gcloud run deploy`

## Environment notes

Build-time values come from root `.env`:

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

Runtime values come from `server/.env`:

- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `OWNER_EMAIL`
- optional `FRONTEND_ORIGIN`

For a single Cloud Run service, `FRONTEND_ORIGIN` is optional because same-host requests are allowed automatically.

## Manual deploy outline

If you do not want to use the helper script, the flow is:

1. `gcloud auth configure-docker REGION-docker.pkg.dev`
2. build a Docker image with the required `VITE_*` build args
3. push the image to Artifact Registry
4. `gcloud run deploy ... --image ... --env-vars-file ...`
