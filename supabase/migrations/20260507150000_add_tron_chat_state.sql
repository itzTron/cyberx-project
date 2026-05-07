create table if not exists public.tron_chat_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active_thread_id text not null default '',
  threads_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_tron_chat_state_updated_at
  on public.tron_chat_state (updated_at desc);

drop trigger if exists trg_tron_chat_state_updated_at on public.tron_chat_state;
create trigger trg_tron_chat_state_updated_at
before update on public.tron_chat_state
for each row
execute function public.set_updated_at();

alter table public.tron_chat_state enable row level security;

drop policy if exists "tron_chat_state_select_owner" on public.tron_chat_state;
create policy "tron_chat_state_select_owner"
on public.tron_chat_state
for select
using (user_id = auth.uid());

drop policy if exists "tron_chat_state_insert_owner" on public.tron_chat_state;
create policy "tron_chat_state_insert_owner"
on public.tron_chat_state
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "tron_chat_state_update_owner" on public.tron_chat_state;
create policy "tron_chat_state_update_owner"
on public.tron_chat_state
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "tron_chat_state_delete_owner" on public.tron_chat_state;
create policy "tron_chat_state_delete_owner"
on public.tron_chat_state
for delete
to authenticated
using (user_id = auth.uid());
