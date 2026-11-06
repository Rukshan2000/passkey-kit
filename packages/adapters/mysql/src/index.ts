import type { ChallengeRecord, ChallengeStore, CredentialStore, CredentialUpdate, StoredCredential } from '@passkey-kit/core';

interface Conn {
  query(sql: string, values?: unknown[]): Promise<[any, unknown]>;
}
/** A `mysql2/promise` Pool (or compatible). */
export interface MysqlPool extends Conn {
  getConnection(): Promise<
    Conn & { beginTransaction(): Promise<void>; commit(): Promise<void>; rollback(): Promise<void>; release(): void }
  >;
}

const COLS = 'id, user_id, public_key, counter, transports, device_type, backed_up, aaguid, name, created_at, last_used_at';

function toCredential(r: any): StoredCredential {
  const t = typeof r.transports === 'string' ? JSON.parse(r.transports) : r.transports;
  return {
    id: r.id,
    userId: r.user_id,
    publicKey: new Uint8Array(r.public_key),
    counter: Number(r.counter),
    transports: t ?? undefined,
    deviceType: r.device_type,
    backedUp: Boolean(r.backed_up),
    aaguid: r.aaguid,
    name: r.name ?? undefined,
    createdAt: new Date(r.created_at),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : undefined,
  };
}

/** MySQL 8+ credential store. Run `migrations/001_init.sql` first. */
export class MysqlCredentialStore implements CredentialStore {
  constructor(private readonly pool: MysqlPool) {}

  async create(c: StoredCredential): Promise<void> {
    await this.pool.query(`INSERT INTO passkey_credentials (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
      c.id,
      c.userId,
      Buffer.from(c.publicKey),
      c.counter,
      c.transports ? JSON.stringify(c.transports) : null,
      c.deviceType,
      c.backedUp,
      c.aaguid,
      c.name ?? null,
      c.createdAt,
      c.lastUsedAt ?? null,
    ]);
  }
  async findById(id: string): Promise<StoredCredential | null> {
    const [rows] = await this.pool.query(`SELECT ${COLS} FROM passkey_credentials WHERE id = ?`, [id]);
    return rows[0] ? toCredential(rows[0]) : null;
  }
  async listByUser(userId: string): Promise<StoredCredential[]> {
    const [rows] = await this.pool.query(`SELECT ${COLS} FROM passkey_credentials WHERE user_id = ? ORDER BY created_at`, [userId]);
    return rows.map(toCredential);
  }
  async update(id: string, u: CredentialUpdate): Promise<void> {
    await this.pool.query(
      `UPDATE passkey_credentials SET counter = GREATEST(counter, COALESCE(?, counter)), backed_up = COALESCE(?, backed_up),
         last_used_at = COALESCE(?, last_used_at), name = COALESCE(?, name) WHERE id = ?`,
      [u.counter ?? null, u.backedUp ?? null, u.lastUsedAt ?? null, u.name ?? null, id],
    );
  }
  async delete(id: string, userId: string): Promise<boolean> {
    const [r] = await this.pool.query('DELETE FROM passkey_credentials WHERE id = ? AND user_id = ?', [id, userId]);
    return r.affectedRows > 0;
  }
}

/** MySQL challenge store. `consume` uses `SELECT ... FOR UPDATE` + `DELETE` in one transaction. */
export class MysqlChallengeStore implements ChallengeStore {
  constructor(private readonly pool: MysqlPool) {}

  async save(r: ChallengeRecord): Promise<void> {
    await this.pool.query('INSERT INTO passkey_challenges (challenge, ceremony, user_id, expires_at) VALUES (?,?,?,?)', [
      r.challenge,
      r.ceremony,
      r.userId ?? null,
      r.expiresAt,
    ]);
  }
  async consume(challenge: string): Promise<ChallengeRecord | null> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query('SELECT * FROM passkey_challenges WHERE challenge = ? FOR UPDATE', [challenge]);
      const r = rows[0];
      if (!r) {
        await conn.commit();
        return null;
      }
      const [del] = await conn.query('DELETE FROM passkey_challenges WHERE challenge = ?', [challenge]);
      await conn.commit();
      if (del.affectedRows !== 1) return null;
      return { challenge: r.challenge, ceremony: r.ceremony, userId: r.user_id ?? undefined, expiresAt: Number(r.expires_at) };
    } catch (e) {
      await conn.rollback().catch(() => {});
      throw e;
    } finally {
      conn.release();
    }
  }
  async deleteExpired(now: number): Promise<void> {
    await this.pool.query('DELETE FROM passkey_challenges WHERE expires_at <= ?', [now]);
  }
}
