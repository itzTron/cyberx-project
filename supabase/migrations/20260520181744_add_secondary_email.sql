-- Add secondary_email column to user_profiles
-- No UNIQUE constraint — same secondary email can appear on multiple accounts
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS secondary_email text DEFAULT NULL;
