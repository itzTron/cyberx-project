-- Create pending_password_changes table for deferred password reset flow
CREATE TABLE IF NOT EXISTS public.pending_password_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_email text NOT NULL,
  encrypted_password text NOT NULL,
  confirm_token text UNIQUE NOT NULL,
  dispute_token text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'applied', 'disputed', 'expired')),
  confirmed_at timestamptz,
  applies_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppc_confirm_token ON public.pending_password_changes (confirm_token);
CREATE INDEX IF NOT EXISTS idx_ppc_dispute_token ON public.pending_password_changes (dispute_token);
CREATE INDEX IF NOT EXISTS idx_ppc_status_applies ON public.pending_password_changes (status, applies_at);

-- Only service role can access this table
ALTER TABLE public.pending_password_changes ENABLE ROW LEVEL SECURITY;
