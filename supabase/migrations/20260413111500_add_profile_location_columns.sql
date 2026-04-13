alter table public.user_profiles
add column if not exists address text not null default '';

alter table public.user_profiles
add column if not exists linkedin_url text not null default '';

alter table public.user_profiles
add column if not exists github_url text not null default '';

alter table public.user_profiles
add column if not exists website_url text not null default '';

alter table public.user_profiles
add column if not exists location_label text not null default '';

alter table public.user_profiles
add column if not exists location_lat double precision;

alter table public.user_profiles
add column if not exists location_lng double precision;
