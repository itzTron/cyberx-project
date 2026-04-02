-- Run this in Supabase SQL Editor for project: mzgtfgtejmvozeifyrak

create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  activity_type text not null,
  activity_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_activity_logs_user_created_at
  on public.activity_logs (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name)
  values (
    new.id,
    lower(trim(new.email)),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = case
      when excluded.full_name = '' then public.user_profiles.full_name
      else excluded.full_name
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_auth_user();

alter table public.user_profiles enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "users_read_own_profile" on public.user_profiles;
create policy "users_read_own_profile"
on public.user_profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "users_update_own_profile" on public.user_profiles;
create policy "users_update_own_profile"
on public.user_profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "users_insert_own_profile" on public.user_profiles;
create policy "users_insert_own_profile"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "users_read_own_activity" on public.activity_logs;
create policy "users_read_own_activity"
on public.activity_logs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users_insert_own_activity" on public.activity_logs;
create policy "users_insert_own_activity"
on public.activity_logs
for insert
to authenticated
with check (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;
grant select on public.user_profiles to authenticated;
grant insert, update on public.user_profiles to authenticated;
grant select, insert on public.activity_logs to authenticated;
