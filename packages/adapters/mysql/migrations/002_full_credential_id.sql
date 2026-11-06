-- Credential IDs can be 1023 bytes (1364 base64url chars). 001 used VARCHAR(1024) with a
-- 255-char prefix primary key, which truncated long IDs and made IDs sharing a prefix collide.
ALTER TABLE passkey_credentials
  DROP PRIMARY KEY,
  MODIFY id VARCHAR(1364) NOT NULL,
  ADD PRIMARY KEY (id);
