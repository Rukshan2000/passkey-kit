CREATE TABLE IF NOT EXISTS passkey_credentials (
  id            VARCHAR(1024) NOT NULL,
  user_id       VARCHAR(64) NOT NULL,
  public_key    VARBINARY(2048) NOT NULL,
  counter       BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports    JSON,
  device_type   VARCHAR(16) NOT NULL,
  backed_up     BOOLEAN NOT NULL,
  aaguid        CHAR(36) NOT NULL,
  name          VARCHAR(128),
  created_at    DATETIME(3) NOT NULL,
  last_used_at  DATETIME(3),
  PRIMARY KEY (id(255)),
  INDEX passkey_credentials_user_id_idx (user_id)
) CHARACTER SET ascii COLLATE ascii_bin;

CREATE TABLE IF NOT EXISTS passkey_challenges (
  challenge   VARCHAR(512) NOT NULL PRIMARY KEY,
  ceremony    ENUM('registration', 'authentication') NOT NULL,
  user_id     VARCHAR(64),
  expires_at  BIGINT NOT NULL,
  INDEX passkey_challenges_expires_at_idx (expires_at)
) CHARACTER SET ascii COLLATE ascii_bin;
