alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('new_follower', 'repo_forked'));

drop policy if exists "users_delete_own_notifications" on public.notifications;
create policy "users_delete_own_notifications"
on public.notifications
for delete
to authenticated
using (auth.uid() = user_id);

grant delete on public.notifications to authenticated;
