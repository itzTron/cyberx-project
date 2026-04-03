alter table public.repositories
add column if not exists show_in_tool_list boolean not null default false;

update public.repositories
set show_in_tool_list = false
where visibility <> 'public'
  and show_in_tool_list = true;

create index if not exists idx_repositories_public_tool_list
  on public.repositories (updated_at desc)
  where visibility = 'public'
    and show_in_tool_list = true
    and archived_at is null;
