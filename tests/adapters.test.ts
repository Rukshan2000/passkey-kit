import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Passkey, type ChallengeStore, type CredentialStore, type StoredCredential } from '@passkey-kit/core';
import { MemoryChallengeStore, MemoryCredentialStore } from '@passkey-kit/memory';
import { VirtualAuthenticator } from './virtual-authenticator.js';

interface Harness {
  setup(): Promise<{ credentials: CredentialStore; challenges: ChallengeStore }>;
  teardown?(): Promise<void>;
}

const harnesses: Record<string, Harness | undefined> = {
  memory: { setup: async () => ({ credentials: new MemoryCredentialStore(), challenges: new MemoryChallengeStore() }) },
};

if (process.env.POSTGRES_URL) {
  const { Pool } = await import('pg');
  const { PostgresChallengeStore, PostgresCredentialStore } = await import('@passkey-kit/postgres');
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  harnesses.postgres = {
    async setup() {
      await pool.query('DROP TABLE IF EXISTS passkey_credentials, passkey_challenges');
      await pool.query(readFileSync('packages/adapters/postgres/migrations/001_init.sql', 'utf8'));
      return { credentials: new PostgresCredentialStore(pool), challenges: new PostgresChallengeStore(pool) };
    },
    teardown: () => pool.end(),
  };
}

if (process.env.MYSQL_URL) {
  const mysql = await import('mysql2/promise');
  const { MysqlChallengeStore, MysqlCredentialStore } = await import('@passkey-kit/mysql');
  const pool = mysql.createPool({ uri: process.env.MYSQL_URL, multipleStatements: true });
  harnesses.mysql = {
    async setup() {
      await pool.query('DROP TABLE IF EXISTS passkey_credentials, passkey_challenges');
      await pool.query(readFileSync('packages/adapters/mysql/migrations/001_init.sql', 'utf8'));
      return { credentials: new MysqlCredentialStore(pool as never), challenges: new MysqlChallengeStore(pool as never) };
    },
    teardown: () => pool.end(),
  };
}

if (process.env.MONGODB_URL) {
  const { MongoClient } = await import('mongodb');
  const { MongoChallengeStore, MongoCredentialStore, ensureMongoIndexes } = await import('@passkey-kit/mongodb');
  const client = await new MongoClient(process.env.MONGODB_URL).connect();
  const db = client.db('passkey_kit_test');
  harnesses.mongodb = {
    async setup() {
      await db.dropDatabase();
      await ensureMongoIndexes(db);
      return { credentials: new MongoCredentialStore(db), challenges: new MongoChallengeStore(db) };
    },
    teardown: () => client.close(),
  };
}

if (process.env.REDIS_URL) {
  const { createClient } = await import('redis');
  const { Redis } = await import('ioredis');
  const { RedisChallengeStore } = await import('@passkey-kit/redis');
  const nodeRedis = await createClient({ url: process.env.REDIS_URL }).connect();
  const ioredis = new Redis(process.env.REDIS_URL);
  // Redis stores only challenges, so credentials come from memory here.
  harnesses.redis = {
    async setup() {
      await nodeRedis.flushDb();
      return { credentials: new MemoryCredentialStore(), challenges: new RedisChallengeStore(nodeRedis) };
    },
    teardown: async () => void (await nodeRedis.quit()),
  };
  harnesses.ioredis = {
    async setup() {
      await ioredis.flushdb();
      return { credentials: new MemoryCredentialStore(), challenges: new RedisChallengeStore(ioredis, 'test:') };
    },
    teardown: async () => void (await ioredis.quit()),
  };
}

// In CI every database must be present; skipping silently would hide a broken adapter.
if (process.env.REQUIRE_DB_TESTS) {
  for (const n of ['postgres', 'mysql', 'mongodb', 'redis'])
    if (!harnesses[n]) throw new Error(`REQUIRE_DB_TESTS is set but ${n.toUpperCase()}_URL is missing`);
}

for (const name of ['memory', 'postgres', 'mysql', 'mongodb', 'redis', 'ioredis']) {
  const h = harnesses[name];
  describe.skipIf(!h)(`${name} adapter`, () => {
    let credentials: CredentialStore;
    let challenges: ChallengeStore;
    beforeAll(async () => ({ credentials, challenges } = await h!.setup()));
    afterAll(async () => h?.teardown?.());

    const cred = (id: string, userId = 'u1'): StoredCredential => ({
      id,
      userId,
      publicKey: new Uint8Array([1, 2, 3, 255]),
      counter: 5,
      transports: ['internal', 'hybrid'],
      deviceType: 'multiDevice',
      backedUp: true,
      aaguid: '00000000-0000-0000-0000-000000000000',
      createdAt: new Date('2026-01-01T00:00:00.000Z'), // fixed: Date.now() here was flaky across a second boundary
    });

    it('credential CRUD round-trips', async () => {
      await credentials.create(cred('c1'));
      await credentials.create(cred('c2'));
      await credentials.create(cred('c3', 'u2'));
      await expect(credentials.create(cred('c1'))).rejects.toThrow();
      expect(await credentials.findById('c1')).toEqual(cred('c1'));
      expect(await credentials.findById('nope')).toBeNull();
      expect((await credentials.listByUser('u1')).map((c) => c.id).sort()).toEqual(['c1', 'c2']);
      const used = new Date(Math.floor(Date.now() / 1000) * 1000);
      await credentials.update('c1', { counter: 9, lastUsedAt: used, name: 'Phone' });
      expect(await credentials.findById('c1')).toMatchObject({ counter: 9, lastUsedAt: used, name: 'Phone', backedUp: true });
      expect(await credentials.delete('c1', 'u2')).toBe(false);
      expect(await credentials.delete('c1', 'u1')).toBe(true);
      expect(await credentials.findById('c1')).toBeNull();
    });

    it('challenges are consumed exactly once, even concurrently', async () => {
      await challenges.save({ challenge: 'ch1', ceremony: 'authentication', userId: 'u1', expiresAt: Date.now() + 60_000 });
      const results = await Promise.all(Array.from({ length: 8 }, () => challenges.consume('ch1')));
      const hits = results.filter(Boolean);
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({ challenge: 'ch1', ceremony: 'authentication', userId: 'u1' });
      expect(await challenges.consume('ch1')).toBeNull();
    });

    it('usernameless challenges have no user', async () => {
      await challenges.save({ challenge: 'ch2', ceremony: 'authentication', expiresAt: Date.now() + 60_000 });
      expect((await challenges.consume('ch2'))?.userId).toBeUndefined();
    });

    it('deleteExpired removes only expired challenges', async () => {
      const now = Date.now();
      await challenges.save({ challenge: 'old', ceremony: 'registration', userId: 'u', expiresAt: now - 1 });
      await challenges.save({ challenge: 'new', ceremony: 'registration', userId: 'u', expiresAt: now + 60_000 });
      await challenges.deleteExpired(now);
      expect(await challenges.consume('old')).toBeNull();
      expect(await challenges.consume('new')).not.toBeNull();
    });

    it('full register + login flow', async () => {
      const passkey = new Passkey({ rpName: 'T', rpID: 'example.com', origin: 'https://example.com', credentials, challenges });
      const a = new VirtualAuthenticator({ origin: 'https://example.com' });
      const opts = await passkey.registration.generateOptions({ userId: 'flow', username: 'flow' });
      const reg = await passkey.registration.verify({ userId: 'flow', response: a.create(opts) });
      expect(reg.verified).toBe(true);
      for (let i = 0; i < 2; i++) {
        const login = await passkey.authentication.verify({ response: a.get(await passkey.authentication.generateOptions()) });
        expect(login.verified && login.userId).toBe('flow');
      }
    });
  });
}
