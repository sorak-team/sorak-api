-- Migration: Add session_id to device_tokens to bind push token to authentication session
ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS session_id BIGINT REFERENCES refresh_tokens(token_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_device_tokens_session ON device_tokens(session_id);
