alter table public.user_profiles
add column if not exists profile_readme text not null default '';

create table if not exists public.repositories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  readme_md text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, name),
  unique (owner_id, slug)
);

create index if not exists idx_repositories_owner_created_at
  on public.repositories (owner_id, created_at desc);

create index if not exists idx_repositories_visibility_created_at
  on public.repositories (visibility, created_at desc);

create table if not exists public.repo_files (
  id bigint generated always as identity primary key,
  repo_id uuid not null references public.repositories (id) on delete cascade,
  path text not null,
  language text not null default 'plaintext',
  content text not null default '',
  size_bytes integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (repo_id, path)
);

create index if not exists idx_repo_files_repo_path
  on public.repo_files (repo_id, path);

create table if not exists public.repo_commits (
  id bigint generated always as identity primary key,
  repo_id uuid not null references public.repositories (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  message text not null,
  files_changed integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_repo_commits_repo_created_at
  on public.repo_commits (repo_id, created_at desc);

drop trigger if exists trg_repositories_updated_at on public.repositories;
create trigger trg_repositories_updated_at
before update on public.repositories
for each row
execute function public.set_updated_at();

drop trigger if exists trg_repo_files_updated_at on public.repo_files;
create trigger trg_repo_files_updated_at
before update on public.repo_files
for each row
execute function public.set_updated_at();

alter table public.repositories enable row level security;
alter table public.repo_files enable row level security;
alter table public.repo_commits enable row level security;

drop policy if exists "repositories_select_public_or_owner" on public.repositories;
create policy "repositories_select_public_or_owner"
on public.repositories
for select
using (visibility = 'public' or owner_id = auth.uid());

drop policy if exists "repositories_insert_owner" on public.repositories;
create policy "repositories_insert_owner"
on public.repositories
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "repositories_update_owner" on public.repositories;
create policy "repositories_update_owner"
on public.repositories
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "repositories_delete_owner" on public.repositories;
create policy "repositories_delete_owner"
on public.repositories
for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists "repo_files_select_visible_repo" on public.repo_files;
create policy "repo_files_select_visible_repo"
on public.repo_files
for select
using (
  exists (
    select 1
    from public.repositories r
    where r.id = repo_files.repo_id
      and (r.visibility = 'public' or r.owner_id = auth.uid())
  )
);

drop policy if exists "repo_files_insert_owner" on public.repo_files;
create policy "repo_files_insert_owner"
on public.repo_files
for insert
to authenticated
with check (
  exists (
    select 1
    from public.repositories r
    where r.id = repo_files.repo_id
      and r.owner_id = auth.uid()
  )
);

drop policy if exists "repo_files_update_owner" on public.repo_files;
create policy "repo_files_update_owner"
on public.repo_files
for update
to authenticated
using (
  exists (
    select 1
    from public.repositories r
    where r.id = repo_files.repo_id
      and r.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.repositories r
    where r.id = repo_files.repo_id
      and r.owner_id = auth.uid()
  )
);

drop policy if exists "repo_files_delete_owner" on public.repo_files;
create policy "repo_files_delete_owner"
on public.repo_files
for delete
to authenticated
using (
  exists (
    select 1
    from public.repositories r
    where r.id = repo_files.repo_id
      and r.owner_id = auth.uid()
  )
);

drop policy if exists "repo_commits_select_visible_repo" on public.repo_commits;
create policy "repo_commits_select_visible_repo"
on public.repo_commits
for select
using (
  exists (
    select 1
    from public.repositories r
    where r.id = repo_commits.repo_id
      and (r.visibility = 'public' or r.owner_id = auth.uid())
  )
);

drop policy if exists "repo_commits_insert_owner" on public.repo_commits;
create policy "repo_commits_insert_owner"
on public.repo_commits
for insert
to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1
    from public.repositories r
    where r.id = repo_commits.repo_id
      and r.owner_id = auth.uid()
  )
);

drop policy if exists "repo_commits_delete_owner" on public.repo_commits;
create policy "repo_commits_delete_owner"
on public.repo_commits
for delete
to authenticated
using (
  exists (
    select 1
    from public.repositories r
    where r.id = repo_commits.repo_id
      and r.owner_id = auth.uid()
  )
);

grant select on public.repositories to anon, authenticated;
grant insert, update, delete on public.repositories to authenticated;

grant select on public.repo_files to anon, authenticated;
grant insert, update, delete on public.repo_files to authenticated;

grant select on public.repo_commits to anon, authenticated;
grant insert, delete on public.repo_commits to authenticated;
