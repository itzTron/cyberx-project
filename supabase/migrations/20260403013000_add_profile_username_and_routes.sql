alter table public.user_profiles
add column if not exists username text;

with username_candidates as (
  select
    up.id,
    up.created_at,
    case
      when trim(both '-' from regexp_replace(lower(regexp_replace(coalesce(nullif(up.full_name, ''), split_part(up.email, '@', 1)), '[^a-z0-9._-]+', '-', 'g')), '-+', '-', 'g')) = ''
        then 'user'
      else trim(both '-' from regexp_replace(lower(regexp_replace(coalesce(nullif(up.full_name, ''), split_part(up.email, '@', 1)), '[^a-z0-9._-]+', '-', 'g')), '-+', '-', 'g'))
    end as base_username
  from public.user_profiles up
),
ranked_candidates as (
  select
    uc.id,
    case
      when row_number() over (partition by uc.base_username order by uc.created_at, uc.id) = 1
        then uc.base_username
      else uc.base_username || '-' || row_number() over (partition by uc.base_username order by uc.created_at, uc.id)::text
    end as final_username
  from username_candidates uc
)
update public.user_profiles up
set username = rc.final_username
from ranked_candidates rc
where up.id = rc.id
  and coalesce(up.username, '') = '';

update public.user_profiles
set username = 'user-' || substring(id::text from 1 for 6)
where coalesce(username, '') = '';

alter table public.user_profiles
alter column username set not null;

create unique index if not exists idx_user_profiles_username_unique
  on public.user_profiles (username);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate_username text;
begin
  base_username := lower(regexp_replace(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)), '[^a-z0-9._-]+', '-', 'g'));
  base_username := regexp_replace(base_username, '-+', '-', 'g');
  base_username := trim(both '-' from base_username);

  if base_username = '' then
    base_username := 'user';
  end if;

  candidate_username := base_username;

  if exists (
    select 1
    from public.user_profiles up
    where up.username = candidate_username
      and up.id <> new.id
  ) then
    candidate_username := base_username || '-' || substring(new.id::text from 1 for 6);
  end if;

  insert into public.user_profiles (id, email, full_name, username)
  values (
    new.id,
    lower(trim(new.email)),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    candidate_username
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = case
      when excluded.full_name = '' then public.user_profiles.full_name
      else excluded.full_name
    end,
    username = case
      when coalesce(public.user_profiles.username, '') = '' then excluded.username
      else public.user_profiles.username
    end,
    updated_at = timezone('utc', now());

  insert into public.activity_logs (user_id, email, activity_type, activity_context)
  values (
    new.id,
    lower(trim(new.email)),
    'sign_up',
    jsonb_build_object('source', 'auth_trigger')
  );

  return new;
end;
$$;
