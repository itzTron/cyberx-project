create table if not exists public.follows (
  id bigint generated always as identity primary key,
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint follows_unique unique (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

create index if not exists idx_follows_following_created_at
  on public.follows (following_id, created_at desc);

create index if not exists idx_follows_follower_created_at
  on public.follows (follower_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  from_user_id uuid references auth.users (id) on delete set null,
  type text not null check (type in ('new_follower')),
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_notifications_user_created_at
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_read_created_at
  on public.notifications (user_id, read, created_at desc);

create or replace function public.handle_new_follow_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  follower_username text;
begin
  select username
  into follower_username
  from public.user_profiles
  where id = new.follower_id;

  insert into public.notifications (user_id, from_user_id, type, message)
  values (
    new.following_id,
    new.follower_id,
    'new_follower',
    case
      when coalesce(trim(follower_username), '') <> '' then '@' || follower_username || ' started following you.'
      else 'Someone started following you.'
    end
  );

  return new;
end;
$$;

drop trigger if exists trg_follows_create_notification on public.follows;
create trigger trg_follows_create_notification
after insert on public.follows
for each row
execute function public.handle_new_follow_notification();

alter table public.follows enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "public_can_read_follows" on public.follows;
create policy "public_can_read_follows"
on public.follows
for select
to anon, authenticated
using (true);

drop policy if exists "users_insert_own_follows" on public.follows;
create policy "users_insert_own_follows"
on public.follows
for insert
to authenticated
with check (auth.uid() = follower_id);

drop policy if exists "users_delete_own_follows" on public.follows;
create policy "users_delete_own_follows"
on public.follows
for delete
to authenticated
using (auth.uid() = follower_id);

drop policy if exists "users_read_own_notifications" on public.notifications;
create policy "users_read_own_notifications"
on public.notifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users_update_own_notifications" on public.notifications;
create policy "users_update_own_notifications"
on public.notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;
grant select, update on public.notifications to authenticated;
