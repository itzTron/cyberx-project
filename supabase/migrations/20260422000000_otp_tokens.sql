-- Migration: Create otp_tokens table for custom OTP-based authentication
-- This table is accessed ONLY via the Supabase service role key (server-side).
-- Row-level security is enabled but no public policies are created,
-- meaning the anon/authenticated roles have zero access.

CREATE TABLE IF NOT EXISTS public.otp_tokens (
  email       TEXT        PRIMARY KEY,
  otp         TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast expiry clean-up queries
CREATE INDEX IF NOT EXISTS idx_otp_tokens_expires_at
  ON public.otp_tokens (expires_at);

-- Enable RLS — service role bypasses all policies automatically
ALTER TABLE public.otp_tokens ENABLE ROW LEVEL SECURITY;

-- No public policies: anon and authenticated roles cannot read/write this table.
-- Only the server (using SUPABASE_SERVICE_ROLE_KEY) has access.

COMMENT ON TABLE public.otp_tokens IS
  'Stores short-lived OTP codes for email-based authentication. '
  'Accessed only via the server-side service role key. '
  'Records are deleted immediately after successful verification or when attempts are exhausted.';
