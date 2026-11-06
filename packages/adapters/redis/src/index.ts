import type { ChallengeRecord, ChallengeStore } from '@passkey-kit/core';

/** node-redis v4+ (`createClient()` from the `redis` package). */
interface NodeRedisClient {
  set(key: string, value: string, options: { PX: number; NX: true }): Promise<unknown>;
  getDel(key: string): Promise<string | null>;
}
/** ioredis (`new Redis()`). */
interface IoRedisClient {
  set(key: string, value: string, px: 'PX', ms: number, nx: 'NX'): Promise<unknown>;
  getdel(key: string): Promise<string | null>;
}
export type RedisClient = NodeRedisClient | IoRedisClient;

/**
 * Redis challenge store, a good fit for several server instances. Challenges expire through
 * Redis TTLs, and `consume` uses `GETDEL` (Redis 6.2+), which is atomic. Use a database
 * adapter for credentials; this package only stores challenges.
 *
 * @example
 * const redis = await createClient({ url: process.env.REDIS_URL }).connect();
 * const challenges = new RedisChallengeStore(redis);
 */
export class RedisChallengeStore implements ChallengeStore {
  constructor(
    private readonly client: RedisClient,
    private readonly prefix = 'passkey:challenge:',
  ) {}

  async save(r: ChallengeRecord): Promise<void> {
    const key = this.prefix + r.challenge;
    const value = JSON.stringify({ ceremony: r.ceremony, userId: r.userId, expiresAt: r.expiresAt });
    const ttl = Math.ceil(r.expiresAt - Date.now());
    if (ttl <= 0) return; // already expired: nothing could ever consume it
    if ('getDel' in this.client) await this.client.set(key, value, { PX: ttl, NX: true });
    else await this.client.set(key, value, 'PX', ttl, 'NX');
  }

  async consume(challenge: string): Promise<ChallengeRecord | null> {
    const key = this.prefix + challenge;
    const raw = 'getDel' in this.client ? await this.client.getDel(key) : await this.client.getdel(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Omit<ChallengeRecord, 'challenge'>;
    return { challenge, ceremony: v.ceremony, userId: v.userId ?? undefined, expiresAt: v.expiresAt };
  }

  /** No-op: Redis deletes expired challenges itself. */
  async deleteExpired(): Promise<void> {}
}
