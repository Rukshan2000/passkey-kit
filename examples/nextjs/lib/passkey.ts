import { Pool } from 'pg';
import { Passkey } from '@passkey-kit/core';
import { PostgresChallengeStore, PostgresCredentialStore } from '@passkey-kit/postgres';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const passkey = new Passkey({
  rpName: 'My App',
  rpID: process.env.PASSKEY_RP_ID!, // e.g. "example.com"
  origin: process.env.PASSKEY_ORIGIN!, // e.g. "https://example.com"
  credentials: new PostgresCredentialStore(pool),
  challenges: new PostgresChallengeStore(pool),
});
