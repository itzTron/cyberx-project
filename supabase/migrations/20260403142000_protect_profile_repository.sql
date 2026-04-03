create or replace function public.repo_slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(regexp_replace(lower(coalesce(input, '')), '[^a-z0-9._-]+', '-', 'g'), '-+', '-', 'g'));
$$;

create or replace function public.is_profile_repository(
  repo_owner_id uuid,
  repo_name text,
  repo_slug text
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = repo_owner_id
      and (
        lower(coalesce(repo_name, '')) = lower(up.username || '.md')
        or coalesce(repo_slug, '') = public.repo_slugify(up.username || '.md')
      )
  );
$$;

update public.repositories r
set archived_at = null
where public.is_profile_repository(r.owner_id, r.name, r.slug)
  and r.archived_at is not null;

create or replace function public.protect_profile_repository()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_profile_repository(old.owner_id, old.name, old.slug) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Profile repository cannot be deleted.'
      using errcode = '42501';
  end if;

  if new.name is distinct from old.name or new.slug is distinct from old.slug then
    raise exception 'Profile repository cannot be renamed.'
      using errcode = '42501';
  end if;

  if new.archived_at is not null then
    raise exception 'Profile repository cannot be archived.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_repositories_protect_profile_repo_update on public.repositories;
create trigger trg_repositories_protect_profile_repo_update
before update on public.repositories
for each row
execute function public.protect_profile_repository();

drop trigger if exists trg_repositories_protect_profile_repo_delete on public.repositories;
create trigger trg_repositories_protect_profile_repo_delete
before delete on public.repositories
for each row
execute function public.protect_profile_repository();
