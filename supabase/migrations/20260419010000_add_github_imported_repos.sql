-- Add GitHub import tracking columns to repositories table
alter table public.repositories
add column if not exists github_url text default null;

alter table public.repositories
add column if not exists imported_from_github boolean not null default false;

-- Index for quickly finding imported repos
create index if not exists idx_repositories_imported_from_github
  on public.repositories (owner_id, imported_from_github)
  where imported_from_github = true;
