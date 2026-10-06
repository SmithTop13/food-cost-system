-- Authentication: owner/manager web sessions, device pairing and device tokens.

ALTER TABLE users ADD COLUMN password_hash text;      -- owners and managers (web dashboard)
ALTER TABLE users ADD CONSTRAINT users_email_lower CHECK (email = lower(email));

-- Opaque session tokens; only a SHA-256 hash is stored.
CREATE TABLE user_sessions (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX ON user_sessions (user_id);

-- One-time codes a manager creates to pair a new tablet with a branch.
CREATE TABLE device_pairing_codes (
  code_hash    text PRIMARY KEY,
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_by   uuid NOT NULL REFERENCES users(id),
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  device_id    uuid REFERENCES devices(id)
);

-- Device tokens are looked up by hash.
CREATE UNIQUE INDEX devices_token_hash ON devices (token_hash) WHERE token_hash IS NOT NULL;
-- A retired device frees its hub priority for a replacement.
ALTER TABLE devices DROP CONSTRAINT devices_branch_id_hub_priority_key;
CREATE UNIQUE INDEX devices_branch_priority ON devices (branch_id, hub_priority) WHERE retired_at IS NULL;
