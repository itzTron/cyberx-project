create table if not exists public.pending_account_actions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  user_email text not null,
  action_type text not null
    check (action_type in ('disable', 'delete')),
  confirm_token text unique not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'expired')),
  requested_from text,
  confirmed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pending_account_actions_confirm_token
  on public.pending_account_actions (confirm_token);

create index if not exists idx_pending_account_actions_user_status
  on public.pending_account_actions (user_id, status, action_type);

alter table public.pending_account_actions enable row level security;
