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
      and (r.owner_id = auth.uid() or r.visibility = 'public')
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
      and (r.owner_id = auth.uid() or r.visibility = 'public')
  )
)
with check (
  exists (
    select 1
    from public.repositories r
    where r.id = repo_files.repo_id
      and (r.owner_id = auth.uid() or r.visibility = 'public')
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
      and (r.owner_id = auth.uid() or r.visibility = 'public')
  )
);
