alter table public.user_profiles
add column if not exists address text not null default '';

alter table public.user_profiles
add column if not exists linkedin_url text not null default '';

alter table public.user_profiles
add column if not exists github_url text not null default '';

alter table public.user_profiles
add column if not exists website_url text not null default '';
