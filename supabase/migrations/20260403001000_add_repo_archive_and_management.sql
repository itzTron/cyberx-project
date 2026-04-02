alter table public.repositories
add column if not exists archived_at timestamptz;
