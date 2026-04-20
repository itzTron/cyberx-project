<p align="center">
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Supabase-Backend-3FCF8E?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/OpenRouter-AI-FF6B35?logo=openai&logoColor=white" alt="OpenRouter" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

# 🛡️ Cyberspace-X 2.0

A full-featured cybersecurity platform built with **Vite + React + TypeScript**. Cyberspace-X 2.0 provides a focused suite of security tools for network analysis, threat detection, and secure operational workflows — complete with a GitHub-style hub for code repositories, user profiles, activity tracking, and an **AI-powered repository agent named Tron**.

---

## ✨ Features

| Category | Highlights |
|---|---|
| **Security Tools** | Network scanner, encryption suite (AES-256), password analyser, threat detector |
| **Hub / Dashboard** | GitHub-style workspace — create repositories, upload code, view commits, manage files |
| **Git VCS** | Real Git-compatible version control — SHA-1 commit hashes, branches, merge, file-level diffs |
| **CodeFile Editor** | Inline code editor with auto language detection, syntax preview, edit existing files or create new ones |
| **🤖 Tron Agent** | AI repository assistant powered by OpenRouter — ask questions, search code, view history, and commit changes via natural language |
| **GitHub Import** | Import public GitHub repositories directly into your hub |
| **User Profiles** | Avatar upload & crop, bio, social links (LinkedIn, GitHub, website), phone & address |
| **Location Picker** | Interactive Google Maps picker with **LocationIQ**-powered geocoding (forward & reverse) |
| **Profile README** | Markdown-based profile page with GitHub-flavored rendering and asset support |
| **Activity Feed** | Real-time activity logging for all repository and profile actions |
| **Auth System** | Sign up, sign in, GitHub OAuth, email verification, and session management via Supabase Auth |
| **UI/UX** | Dark theme, glassmorphism, Matrix rain animation, neon accents, Framer Motion animations, typewriter hero text, page progress bar |
| **Responsive** | Fully responsive across desktop, tablet, and mobile devices |

---

## 🤖 Tron — AI Repository Agent

**Tron** is a built-in AI assistant that lives at `/tron`. It connects to your repositories and lets you interact with them using plain English.

### What Tron Can Do

| Capability | Example prompt |
|---|---|
| **List files** | *"What files are in this repo?"* |
| **Read file content** | *"Show me the contents of App.tsx"* |
| **Search code** | *"Find all TODO comments"* |
| **Commit history** | *"Show me the last 10 commits"* |
| **Commit diffs** | *"What changed between the last two commits?"* |
| **Create commits** | *"Rename the variable foo to bar in utils.ts"* |
| **Create branches** | *"Create a new branch called feature/login"* |

### How It Works

Tron uses a multi-step **agentic loop** (up to 7 tool calls per query) powered by free models from **OpenRouter**. It selects the right repository tool, executes it, and reasons until a final answer is ready. Write operations (commits) require explicit confirmation before execution.

### Setup

Add your OpenRouter key to `.env`:

```env
VITE_OPENROUTER_API_KEY=your_openrouter_api_key_here
```

Get a free API key at [openrouter.ai](https://openrouter.ai/). The default model is `nvidia/nemotron-3-super-120b-a12b:free` — no paid plan required.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Build Tool** | [Vite 5](https://vitejs.dev/) with SWC |
| **Framework** | [React 18](https://react.dev/) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) |
| **Styling** | [Tailwind CSS 3](https://tailwindcss.com/) + [tailwindcss-animate](https://github.com/jamiebuilds/tailwindcss-animate) |
| **UI Components** | [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) |
| **Animations** | [Framer Motion](https://www.framer.com/motion/) |
| **Backend** | [Supabase](https://supabase.com/) (Auth, PostgreSQL, Storage) |
| **AI Agent** | [OpenRouter](https://openrouter.ai/) (free LLM routing — Nemotron, Gemma, etc.) |
| **Routing** | [React Router v6](https://reactrouter.com/) |
| **Charts** | [Recharts](https://recharts.org/) |
| **Markdown** | [react-markdown](https://github.com/remarkjs/react-markdown) + remark-gfm + rehype-raw |
| **Maps** | [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript) |
| **Geocoding** | [LocationIQ API](https://locationiq.com/) |
| **State** | [TanStack Query](https://tanstack.com/query) (React Query) |
| **Forms** | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) |
| **Code Quality** | ESLint 9 + SonarQube (optional) |

---

## 📋 Prerequisites

Make sure you have these installed before proceeding:

- **[Node.js](https://nodejs.org/)** v18 or later
- **[npm](https://www.npmjs.com/)** v9 or later (comes with Node.js)
- **[Git](https://git-scm.com/)**
- **[Supabase CLI](https://supabase.com/docs/guides/cli)** *(optional — only needed to run migrations or a local Supabase instance)*
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** *(optional — only needed for local Supabase)*

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/itzTron/cyberx-project.git
cd cyberx-project
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create the Environment File

Copy the example `.env` and fill in your keys:

**Linux / macOS:**
```bash
cp .env.example .env
```

**Windows PowerShell:**
```powershell
Copy-Item .env.example .env
```

### 4. Configure Environment Variables

Open `.env` in your editor and set the required values:

```env
# ── Supabase (Required) ──────────────────────────────────────────
VITE_SUPABASE_PROJECT_ID=your_project_id
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# ── OpenRouter (Required for Tron AI Agent) ───────────────────────
VITE_OPENROUTER_API_KEY=your_openrouter_api_key_here
VITE_OPENROUTER_MODEL=nvidia/nemotron-3-super-120b-a12b:free
VITE_OPENROUTER_FALLBACK_MODELS=nvidia/nemotron-3-nano-30b-a3b:free,google/gemma-4-26b-a4b-it:free

# ── Google Maps (Optional – interactive map picker) ───────────────
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# ── LocationIQ (Optional – address geocoding) ─────────────────────
VITE_LOCATIONIQ_API_KEY=your_locationiq_api_key
```

> **Notes:**
> - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are **required** for auth and dashboard to work.
> - If `VITE_SUPABASE_URL` is omitted, the app falls back to building the URL from `VITE_SUPABASE_PROJECT_ID`.
> - `VITE_OPENROUTER_API_KEY` is **required** to use the Tron AI Agent. Get a free key at [openrouter.ai](https://openrouter.ai/).
> - `VITE_GOOGLE_MAPS_API_KEY` enables the interactive map picker on the profile page. Without it, the visual map is disabled but geocoding still works.
> - `VITE_LOCATIONIQ_API_KEY` is used for address search and coordinate-to-address resolution. Get a free key at [locationiq.com](https://locationiq.com/).

### 5. Set Up the Database

This project depends on SQL migrations in [`supabase/migrations/`](./supabase/migrations). Choose one of the options below.

#### Option A — Hosted Supabase Project (Recommended)

1. Create a project at [supabase.com](https://supabase.com/).
2. Copy your **Project ID**, **URL**, and **Anon Key** into `.env`.
3. Apply migrations using the Supabase CLI:

```bash
supabase login
supabase link --project-ref your_project_id
supabase db push
```

#### Option B — Local Supabase (Docker)

1. Make sure Docker Desktop is running.
2. Start the local Supabase stack:

```bash
supabase start
```

3. Get the local credentials:

```bash
supabase status
```

4. Update `.env` with the local URL and anon key.
5. Apply migrations:

```bash
supabase db reset
```

### 6. Start the Development Server

```bash
npm run dev
```

The app will be available at:

```
http://localhost:8080
```

### 7. Verify Your Setup

1. Open the app in your browser.
2. Navigate to `/signup` and create a test account.
3. Confirm that **Sign In**, **Profile**, and **Dashboard** pages load without errors.
4. Navigate to `/tron`, select a repository, and ask Tron *"List all files"* to verify the AI agent.
5. *(Optional)* Go to `/profile`, add an address, and click **Locate Address** to verify LocationIQ geocoding.

---

## 📁 Project Structure

```
cyberx-project/
├── public/                     # Static assets
├── scripts/                    # Build & CI scripts (SonarQube)
├── src/
│   ├── components/             # Reusable UI components
│   │   ├── ui/                 # shadcn/ui primitives
│   │   ├── Navbar.tsx          # Global navigation bar
│   │   ├── Footer.tsx          # Site footer
│   │   ├── MatrixRain.tsx      # Matrix rain background animation
│   │   ├── Preloader.tsx       # Splash screen preloader
│   │   ├── NavigationProgress.tsx  # GitHub-style page loading bar
│   │   ├── GitHubReadme.tsx    # Markdown renderer for profile READMEs
│   │   ├── GlassCard.tsx       # Glassmorphism card component
│   │   ├── SectionHeader.tsx   # Section title component
│   │   ├── ToolCard.tsx        # Security tool card component
│   │   ├── BranchSelector.tsx  # Git branch switcher / create / merge UI
│   │   └── CommitDiffViewer.tsx # Commit diff dialog with inline file diffs
│   ├── data/                   # Static data (tools list, etc.)
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utility libraries
│   │   ├── supabase.ts         # Supabase client initialisation
│   │   ├── authApi.ts          # Authentication API helpers
│   │   ├── hubApi.ts           # Hub / repository / profile API + Git VCS wrappers
│   │   ├── gitVcs.ts           # Git VCS engine (SHA-1 hashing, commits, branches, merge, diff)
│   │   ├── repoAgent.ts        # Tron AI agent — agentic loop, tool execution, OpenRouter integration
│   │   ├── githubApi.ts        # GitHub repository import API
│   │   ├── googleMaps.ts       # Google Maps API loader
│   │   ├── locationIQ.ts       # LocationIQ geocoding API
│   │   ├── emailValidation.ts  # Email validation utilities
│   │   └── utils.ts            # General utilities
│   ├── pages/                  # Route page components
│   │   ├── Index.tsx            # Homepage
│   │   ├── Features.tsx         # Features overview
│   │   ├── Tools.tsx            # Security tools listing
│   │   ├── ToolDetail.tsx       # Individual tool detail page
│   │   ├── Download.tsx         # Download page
│   │   ├── Docs.tsx             # Documentation page
│   │   ├── Contact.tsx          # Contact form
│   │   ├── SignIn.tsx           # Sign in page
│   │   ├── SignUp.tsx           # Sign up page
│   │   ├── Dashboard.tsx        # Hub dashboard (profile, README, recent activity)
│   │   ├── Repository.tsx       # Repository management (files, commits, branches, code editor)
│   │   ├── TronAgent.tsx        # 🤖 Tron AI agent chat page
│   │   ├── Profile.tsx          # Profile settings (avatar, bio, location, links)
│   │   ├── Activity.tsx         # Activity feed
│   │   └── NotFound.tsx         # 404 page
│   ├── App.tsx                 # Root component with routing
│   ├── main.tsx                # Application entry point
│   └── index.css               # Global styles & Tailwind directives
├── supabase/
│   ├── config.toml             # Supabase project configuration
│   └── migrations/             # SQL migration files (includes Git VCS tables)
├── .env.example                # Environment variable template
├── package.json                # Dependencies & scripts
├── tailwind.config.ts          # Tailwind CSS configuration
├── tsconfig.json               # TypeScript configuration
└── vite.config.ts              # Vite build configuration
```

---

## 🗺️ Routes

| Route | Page | Description |
|---|---|---|
| `/` | Index | Homepage with hero, features overview |
| `/features` | Features | Detailed feature breakdown |
| `/tools` | Tools | Security tools listing |
| `/tools/:slug` | ToolDetail | Individual tool detail |
| `/download` | Download | Download & installation page |
| `/docs` | Docs | Documentation |
| `/contact` | Contact | Contact form |
| `/signin` | SignIn | Authentication — sign in |
| `/signup` | SignUp | Authentication — sign up |
| `/dashboard` | Dashboard | User hub (profile card, README, activity) |
| `/repository` | Repository | Repository manager (files, commits, branches, editor) |
| `/tron` | TronAgent | 🤖 Tron AI agent chat interface |
| `/profile` | Profile | Profile settings |
| `/activity` | Activity | Activity feed |
| `/:username` | Dashboard | Public profile view |

---

## 📜 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server on `http://localhost:8080` |
| `npm run build` | Build the production bundle to `dist/` |
| `npm run build:dev` | Build in development mode (with source maps) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint across the project |
| `npm run sonar:check` | Verify SonarQube token is configured |
| `npm run sonar:scan` | Run SonarQube scanner for code analysis |

---

## 🌐 API Keys Guide

### Supabase (Required)

1. Go to [supabase.com](https://supabase.com/) and create a free project.
2. Navigate to **Project Settings → API** to find your URL and anon key.
3. Add them to `.env`.

### OpenRouter (Required for Tron Agent)

1. Sign up at [openrouter.ai](https://openrouter.ai/).
2. Create an API key from the dashboard.
3. Add it to `.env` as `VITE_OPENROUTER_API_KEY`.
4. The default model (`nvidia/nemotron-3-super-120b-a12b:free`) is **free** — no credits needed.
5. Optionally set `VITE_OPENROUTER_MODEL` to any other model ID on OpenRouter.

### LocationIQ (Free — Geocoding)

1. Sign up at [locationiq.com](https://locationiq.com/).
2. Get your API token from the dashboard.
3. Add it to `.env` as `VITE_LOCATIONIQ_API_KEY`.
4. Free tier includes **5,000 requests/day**.

### Google Maps (Optional — Interactive Map)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Maps JavaScript API**.
3. Create an API key and restrict it to your domain.
4. Add it to `.env` as `VITE_GOOGLE_MAPS_API_KEY`.

> **Tip:** The profile location feature works **without** Google Maps — geocoding uses LocationIQ. Google Maps only adds the visual interactive map picker.

---

## 🏗️ Build for Production

```bash
npm run build
```

The optimised production bundle is output to the `dist/` directory. You can deploy it to any static hosting provider:

- [Vercel](https://vercel.com/)
- [Netlify](https://www.netlify.com/)
- [Cloudflare Pages](https://pages.cloudflare.com/)
- [GitHub Pages](https://pages.github.com/)

---

## 🔧 Troubleshooting

### "Supabase is not configured" error

- Verify `.env` exists in the project root.
- Confirm `VITE_SUPABASE_ANON_KEY` is set.
- Confirm `VITE_SUPABASE_URL` or `VITE_SUPABASE_PROJECT_ID` is set.
- **Restart the dev server** after editing `.env` (Vite requires a restart to load new env variables).

### Tron Agent returns an error

- Confirm `VITE_OPENROUTER_API_KEY` is set in `.env`.
- Check your OpenRouter usage at [openrouter.ai/activity](https://openrouter.ai/activity).
- The free model may be rate-limited — the agent will automatically retry with fallback models.
- Restart the dev server after adding the key.

### Address search / geocoding not working

- Verify `VITE_LOCATIONIQ_API_KEY` is set in `.env`.
- Check your LocationIQ usage quota at [locationiq.com/dashboard](https://locationiq.com/dashboard).
- Restart the dev server after adding the key.

### Map picker shows black screen on re-open

- This was a known issue that has been fixed. If you still encounter it, pull the latest code.

### Database migrations fail

- Ensure Docker Desktop is running (for local Supabase).
- Update the Supabase CLI to the latest version: `npm i -g supabase`.
- Run `supabase status` to check if the local stack is already running.

---

## 🔀 Git Version Control System

Cyberspace-X 2.0 includes a **browser-native Git VCS** that produces **real Git-compatible SHA-1 hashes** — no server-side Git binary required.

### How It Works

| Layer | Description |
|---|---|
| **`gitVcs.ts`** | Core engine — computes Git blob, tree, and commit hashes using Web Crypto API (SHA-1) |
| **`hubApi.ts`** | API wrappers for branches, merge, diff, and file-at-commit |
| **Supabase tables** | `git_file_snapshots` (file tree per commit), `git_refs` (branch pointers), `repo_commits.git_hash` |
| **Repository UI** | Branch selector, commit SHA badges, inline diff viewer, CodeFile editor |

### Features

- **Commit Hashes** — every commit gets a Git-compatible SHA-1 hash (identical to `git hash-object`)
- **Branches** — create, switch, merge, and delete branches
- **Merge** — file-level merge with merge commit
- **Diff Viewer** — click any commit to see file-level additions, modifications, and deletions
- **Retroactive Backfill** — existing repos automatically get Git hashes on first load
- **CodeFile Editor** — write or edit code inline, auto-detect language, commit directly

### Database Tables

The Git VCS uses these tables (created by migration `20260418120000_add_git_vcs_tables.sql`):

```sql
-- File snapshots per commit
git_file_snapshots (id, repo_id, commit_hash, path, blob_hash, content, size_bytes, language)

-- Branch refs
git_refs (id, repo_id, ref_name, target_hash)

-- Extended commit columns
repo_commits.git_hash    -- Git SHA-1 hash
repo_commits.parent_hash -- Parent commit hash
```

---

## 🤝 Contributing

Contributions are welcome! To contribute:

1. **Fork** the repository.
2. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Commit** your changes with a clear message:
   ```bash
   git commit -m "feat: add your feature description"
   ```
4. **Push** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
5. **Open a Pull Request** against the `main` branch.

---

## 📄 License

This project is open-source and available under the [MIT License](./LICENSE).

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/itzTron">itzTron</a>
</p>
