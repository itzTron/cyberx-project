# Azure App Service Deployment

This repository is prepared for a single-service Azure deployment:

- The Vite frontend is built in GitHub Actions.
- The Express server serves `dist/` plus the API routes from the same Azure Web App.
- Supabase remains external.

## What changed

- `server/index.js` now serves the built frontend, adds health endpoints, and applies production security headers.
- `src/lib/apiBaseUrl.ts` lets the frontend use the same origin automatically on Azure App Service.
- `.github/workflows/main_cyberx-project.yml` builds a minimal deployment package and deploys it to the existing `cyberx-project` Azure Web App.
- `server/.env.example` and `azure/appservice.appsettings.example.json` define the backend settings expected in Azure.

## Required GitHub repository configuration

### Repository secrets

- `AZUREAPPSERVICE_CLIENTID_8F9674CD18B64FAF92CC06B255BC901F`
- `AZUREAPPSERVICE_TENANTID_ECBC2BD11B1A4793BE2496CFD927C896`
- `AZUREAPPSERVICE_SUBSCRIPTIONID_2EE598F8273E465C84DB8AE4105A4520`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_OPENROUTER_API_KEY` if the Tron repository agent should work in production
- `VITE_GOOGLE_MAPS_API_KEY` if the map picker should work in production
- `VITE_LOCATIONIQ_API_KEY` if geocoding should work in production

### Repository variables

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_OPENROUTER_MODEL`
- `VITE_OPENROUTER_FALLBACK_MODELS`
- `VITE_OPENROUTER_SITE_URL`
- `VITE_OPENROUTER_SITE_TITLE`

## Required Azure App Service settings

Use `azure/appservice.appsettings.example.json` as the source of truth for:

- `NODE_ENV=production`
- `TRUST_PROXY=1`
- `FRONTEND_ORIGIN=https://<your-app>.azurewebsites.net`
- `OWNER_EMAIL`
- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_*`

## Azure platform settings

Set these in the Azure portal for the Web App:

- Runtime stack: Node 20 LTS on Linux
- Startup command: `node server/index.js`
- HTTPS only: enabled
- Minimum TLS version: 1.2 or higher
- HTTP/2: enabled
- Health check path: `/health`
- Always On: enabled
- FTPS: disabled unless you explicitly need it

## Security notes

- User-controlled strings are HTML-escaped before being inserted into notification emails.
- The server disables `X-Powered-By`, trusts Azure's reverse proxy when `TRUST_PROXY=1`, and sets strict transport and referrer headers in production.
- Contact/report owner mailboxes are no longer hardcoded in source; they come from `OWNER_EMAIL`.
- The contact form no longer relies on a delayed `setTimeout` email send, which is unreliable on scaled or restarted cloud instances.

## Current blocker in this repository

The last Azure deployment workflow failed before deployment with:

- `No subscriptions found for ***`

That means the current Azure OIDC identity in GitHub is not mapped to a subscription that GitHub Actions can access. The workflow itself can run, but Azure login must be fixed before deployment can succeed.

To fix that:

1. Verify the Azure service principal identified by the stored `client-id` still exists.
2. Ensure it has a federated credential for `repo:itzTron/cyberx-project:ref:refs/heads/main`.
3. Assign that principal at least `Contributor` on the target resource group or Web App scope.
4. Confirm the stored `subscription-id` belongs to the same tenant and contains that assignment.

## Triggering deployment

After fixing Azure login and setting the GitHub secrets/variables:

1. Push to `main`, or
2. Run the `Build and deploy Cyberspace-X to Azure Web App` workflow manually from GitHub Actions.
