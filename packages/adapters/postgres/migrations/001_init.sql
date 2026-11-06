CREATE TABLE IF NOT EXISTS passkey_credentials (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  public_key    BYTEA NOT NULL,
  counter       BIGINT NOT NULL DEFAULT 0,
  transports    TEXT[],
  device_type   TEXT NOT NULL,
  backed_up     BOOLEAN NOT NULL,
  aaguid        TEXT NOT NULL,
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL,
  last_used_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS passkey_credentials_user_id_idx ON passkey_credentials (user_id);

CREATE TABLE IF NOT EXISTS passkey_challenges (
  challenge   TEXT PRIMARY KEY,
  ceremony    TEXT NOT NULL CHECK (ceremony IN ('registration', 'authentication')),
  user_id     TEXT,
  expires_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS passkey_challenges_expires_at_idx ON passkey_challenges (expires_at);
