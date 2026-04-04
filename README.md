# cyberx-project

`cyberx-project` is a Vite + React + TypeScript frontend for the Cyberspace-X 2.0 security platform. It uses Supabase for authentication, profile data, activity logging, and repository-style hub features.

## Tech Stack

- Vite
- React 18
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase

## Prerequisites

Install these before starting:

- Node.js 18 or later
- npm 9 or later
- Git
- Supabase CLI (optional, only needed if you want to run the backend locally or apply migrations to your own Supabase project)

## Step-by-Step Installation

### 1. Clone the repository

```bash
git clone https://github.com/itzTron/cyberx-project.git
cd cyberx-project
```

### 2. Install project dependencies

```bash
npm install
```

### 3. Create your environment file

Copy the example file and create a local `.env`:

```bash
cp .env.example .env
```

If you are on Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

### 4. Configure Supabase environment variables

Open `.env` and set the frontend variables:

```env
VITE_SUPABASE_PROJECT_ID=your_project_id
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Notes:

- `VITE_SUPABASE_URL` can be used on its own.
- If `VITE_SUPABASE_URL` is omitted, the app builds the URL from `VITE_SUPABASE_PROJECT_ID`.
- The app will not start correctly for auth and dashboard features until `VITE_SUPABASE_ANON_KEY` is set.

### 5. Apply the database schema

This project depends on the SQL migrations inside [`supabase/migrations`](./supabase/migrations). You have two setup options.

#### Option A: Use an existing hosted Supabase project

1. Create a Supabase project in the Supabase dashboard.
2. Add the values from that project to `.env`.
3. Apply the SQL in `supabase/migrations` to your project.

If you want to use the CLI for that:

```bash
supabase login
supabase link --project-ref your_project_id
supabase db push
```

#### Option B: Run Supabase locally

1. Install Docker Desktop and the Supabase CLI.
2. Start the local stack:

```bash
supabase start
```

3. Get the local API URL and anon key:

```bash
supabase status
```

4. Update `.env` with the local values returned by the CLI.
5. If needed, apply migrations:

```bash
supabase db reset
```

### 6. Start the development server

```bash
npm run dev
```

Open the local app at:

```text
http://localhost:5173
```

### 7. Verify the setup

After the app starts:

1. Open the homepage in your browser.
2. Go to `/signup` and create a test account.
3. Confirm that sign-in, profile, and dashboard pages load without Supabase configuration errors.

## Useful Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run sonar:check
npm run sonar:scan
```

## Project Structure

```text
.
|-- public/
|-- scripts/
|-- src/
|-- supabase/
|   |-- config.toml
|   `-- migrations/
|-- .env.example
|-- package.json
`-- vite.config.ts
```

## Troubleshooting

### Supabase is not configured

If you see an error about Supabase not being configured, check that:

- `.env` exists in the project root
- `VITE_SUPABASE_ANON_KEY` is set
- `VITE_SUPABASE_URL` or `VITE_SUPABASE_PROJECT_ID` is set
- you restarted `npm run dev` after editing `.env`

### Migrations fail locally

If `supabase db push` or `supabase db reset` fails:

- make sure Docker is running
- make sure the Supabase CLI is installed and updated
- check whether your local stack is already running with `supabase status`

## Build for Production

```bash
npm run build
```

The production-ready frontend output is generated in `dist/`.
