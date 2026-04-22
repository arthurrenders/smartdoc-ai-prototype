-- Gmail send (OAuth tokens; read/write only via service role in app server code)
CREATE TABLE IF NOT EXISTS realtor_gmail_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_email TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE realtor_gmail_tokens ENABLE ROW LEVEL SECURITY;

-- Only the owning user may read or write their own token row.
CREATE POLICY "owner_all" ON realtor_gmail_tokens
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
