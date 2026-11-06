import type { ChallengeRecord, ChallengeStore, CredentialStore, CredentialUpdate, StoredCredential } from '@passkey-kit/core';

/** Anything with pg's `query(text, values)` shape: `Pool`, `Client`, or `PoolClient`. */
export interface PgQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

const COLS = 'id, user_id, public_key, counter, transports, device_type, backed_up, aaguid, name, created_at, last_used_at';

function toCredential(r: any): StoredCredential {
  return {
    id: r.id,
    userId: r.user_id,
    publicKey: new Uint8Array(r.public_key),
    counter: Number(r.counter),
    transports: r.transports ?? undefined,
    deviceType: r.device_type,
    backedUp: r.backed_up,
    aaguid: r.aaguid,
    name: r.name ?? undefined,
    createdAt: new Date(r.created_at),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : undefined,
  };
}

/** PostgreSQL credential store. Run `migrations/001_init.sql` first. */
export class PostgresCredentialStore implements CredentialStore {
  constructor(private readonly db: PgQueryable) {}

  async create(c: StoredCredential): Promise<void> {
    await this.db.query(`INSERT INTO passkey_credentials (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [
      c.id,
      c.userId,
      Buffer.from(c.publicKey),
      c.counter,
      c.transports ?? null,
      c.deviceType,
      c.backedUp,
      c.aaguid,
      c.name ?? null,
      c.createdAt,
      c.lastUsedAt ?? null,
    ]);
  }
  async findById(id: string): Promise<StoredCredential | null> {
    const { rows } = await this.db.query(`SELECT ${COLS} FROM passkey_credentials WHERE id = $1`, [id]);
    return rows[0] ? toCredential(rows[0]) : null;
  }
  async listByUser(userId: string): Promise<StoredCredential[]> {
    const { rows } = await this.db.query(`SELECT ${COLS} FROM passkey_credentials WHERE user_id = $1 ORDER BY created_at`, [userId]);
    return rows.map(toCredential);
  }
  async update(id: string, u: CredentialUpdate): Promise<void> {
    await this.db.query(
      `UPDATE passkey_credentials SET
         counter = GREATEST(counter, COALESCE($2, counter)), backed_up = COALESCE($3, backed_up),
         last_used_at = COALESCE($4, last_used_at), name = COALESCE($5, name)
       WHERE id = $1`,
      [id, u.counter ?? null, u.backedUp ?? null, u.lastUsedAt ?? null, u.name ?? null],
    );
  }
  async delete(id: string, userId: string): Promise<boolean> {
    const r = await this.db.query('DELETE FROM passkey_credentials WHERE id = $1 AND user_id = $2', [id, userId]);
    return (r.rowCount ?? 0) > 0;
  }
}

/** PostgreSQL challenge store. `consume` is a single atomic `DELETE ... RETURNING`. */
export class PostgresChallengeStore implements ChallengeStore {
  constructor(private readonly db: PgQueryable) {}

  async save(r: ChallengeRecord): Promise<void> {
    await this.db.query('INSERT INTO passkey_challenges (challenge, ceremony, user_id, expires_at) VALUES ($1,$2,$3,$4)', [
      r.challenge,
      r.ceremony,
      r.userId ?? null,
      r.expiresAt,
    ]);
  }
  async consume(challenge: string): Promise<ChallengeRecord | null> {
    const { rows } = await this.db.query('DELETE FROM passkey_challenges WHERE challenge = $1 RETURNING *', [challenge]);
    const r = rows[0];
    return r ? { challenge: r.challenge, ceremony: r.ceremony, userId: r.user_id ?? undefined, expiresAt: Number(r.expires_at) } : null;
  }
  async deleteExpired(now: number): Promise<void> {
    await this.db.query('DELETE FROM passkey_challenges WHERE expires_at <= $1', [now]);
  }
}
