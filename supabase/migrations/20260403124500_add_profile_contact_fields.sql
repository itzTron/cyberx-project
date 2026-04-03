alter table public.user_profiles
add column if not exists bio text not null default '';

alter table public.user_profiles
add column if not exists phone_number text not null default '';

alter table public.user_profiles
add column if not exists avatar_url text not null default '';
