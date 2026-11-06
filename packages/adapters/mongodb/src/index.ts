import type { Binary, Collection, Db } from 'mongodb';
import type { ChallengeRecord, ChallengeStore, CredentialStore, CredentialUpdate, StoredCredential } from '@passkey-kit/core';

type CredDoc = Omit<StoredCredential, 'id' | 'publicKey'> & { _id: string; publicKey: Binary | Uint8Array };
type ChallengeDoc = Omit<ChallengeRecord, 'challenge' | 'expiresAt'> & { _id: string; expiresAt: Date };

function toCredential({ _id, publicKey, ...rest }: CredDoc): StoredCredential {
  const bytes = publicKey instanceof Uint8Array ? publicKey : publicKey.buffer;
  const cred = { ...rest, id: _id, publicKey: new Uint8Array(bytes) } as StoredCredential;
  for (const k of ['transports', 'name', 'lastUsedAt'] as const) if (cred[k] == null) delete cred[k];
  return cred;
}

/**
 * Create indexes (user lookup, TTL expiry of challenges; `_id` is already unique). Call once at startup.
 * The TTL index is a backstop; expiry is also checked on every verification.
 */
export async function ensureMongoIndexes(db: Db, prefix = 'passkey_'): Promise<void> {
  await db.collection(`${prefix}credentials`).createIndex({ userId: 1 });
  await db.collection(`${prefix}challenges`).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

export class MongoCredentialStore implements CredentialStore {
  private readonly col: Collection<CredDoc>;
  constructor(db: Db, collection = 'passkey_credentials') {
    this.col = db.collection<CredDoc>(collection);
  }
  async create({ id, ...c }: StoredCredential): Promise<void> {
    await this.col.insertOne({ ...c, _id: id });
  }
  async findById(id: string): Promise<StoredCredential | null> {
    const d = await this.col.findOne({ _id: id });
    return d ? toCredential(d) : null;
  }
  async listByUser(userId: string): Promise<StoredCredential[]> {
    return (await this.col.find({ userId }).sort({ createdAt: 1 }).toArray()).map(toCredential);
  }
  async update(id: string, u: CredentialUpdate): Promise<void> {
    const { counter, ...rest } = u;
    const set = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    const op: Record<string, object> = {};
    if (Object.keys(set).length) op.$set = set;
    // $max: concurrent logins may finish out of order; never move the counter backwards.
    if (counter !== undefined) op.$max = { counter };
    if (Object.keys(op).length) await this.col.updateOne({ _id: id }, op);
  }
  async delete(id: string, userId: string): Promise<boolean> {
    return (await this.col.deleteOne({ _id: id, userId })).deletedCount === 1;
  }
}

/** `consume` uses `findOneAndDelete`, which is atomic per document. */
export class MongoChallengeStore implements ChallengeStore {
  private readonly col: Collection<ChallengeDoc>;
  constructor(db: Db, collection = 'passkey_challenges') {
    this.col = db.collection<ChallengeDoc>(collection);
  }
  async save(r: ChallengeRecord): Promise<void> {
    const doc: ChallengeDoc = { _id: r.challenge, ceremony: r.ceremony, expiresAt: new Date(r.expiresAt) };
    if (r.userId !== undefined) doc.userId = r.userId;
    await this.col.insertOne(doc);
  }
  async consume(challenge: string): Promise<ChallengeRecord | null> {
    const d = await this.col.findOneAndDelete({ _id: challenge });
    if (!d) return null;
    return { challenge: d._id, ceremony: d.ceremony, userId: d.userId ?? undefined, expiresAt: d.expiresAt.getTime() };
  }
  async deleteExpired(now: number): Promise<void> {
    await this.col.deleteMany({ expiresAt: { $lte: new Date(now) } });
  }
}
