alter table if exists public.pending_account_actions
  add column if not exists cancel_token text;

alter table if exists public.pending_account_actions
  add column if not exists password_verified_at timestamptz;

update public.pending_account_actions
set cancel_token = gen_random_uuid()::text
where cancel_token is null;

alter table if exists public.pending_account_actions
  drop constraint if exists pending_account_actions_status_check;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.pending_account_actions'::regclass
      and c.contype = 'c'
      and (pg_get_constraintdef(c.oid) like '%status IN (%' or pg_get_constraintdef(c.oid) like '%status%')
  loop
    execute format(
      'alter table public.pending_account_actions drop constraint if exists %I',
      constraint_name
    );
  end loop;
end $$;

alter table if exists public.pending_account_actions
  alter column cancel_token set not null;

alter table if exists public.pending_account_actions
  add constraint pending_account_actions_status_check
  check (status in ('pending', 'completed', 'expired', 'cancelled'));

create unique index if not exists idx_pending_account_actions_cancel_token
  on public.pending_account_actions (cancel_token);
