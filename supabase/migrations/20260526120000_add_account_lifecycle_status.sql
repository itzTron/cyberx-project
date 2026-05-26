alter table public.user_profiles
add column if not exists account_status text not null default 'active'
  check (account_status in ('active', 'disabled'));

alter table public.user_profiles
add column if not exists account_disabled_at timestamptz;

create index if not exists idx_user_profiles_account_status
  on public.user_profiles (account_status);
