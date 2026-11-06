import type { ChallengeRecord, ChallengeStore, CredentialStore, CredentialUpdate, StoredCredential } from '@passkey-kit/core';

/**
 * In-process stores for development and tests ONLY. Data is lost on restart and is
 * not shared between processes, so challenges issued by one instance cannot be
 * verified by another behind a load balancer.
 */
export class MemoryCredentialStore implements CredentialStore {
  private readonly map = new Map<string, StoredCredential>();

  async create(c: StoredCredential): Promise<void> {
    if (this.map.has(c.id)) throw new Error('Credential already exists');
    this.map.set(c.id, structuredClone(c));
  }
  async findById(id: string): Promise<StoredCredential | null> {
    const c = this.map.get(id);
    return c ? structuredClone(c) : null;
  }
  async listByUser(userId: string): Promise<StoredCredential[]> {
    return [...this.map.values()].filter((c) => c.userId === userId).map((c) => structuredClone(c));
  }
  async update(id: string, update: CredentialUpdate): Promise<void> {
    const c = this.map.get(id);
    if (c) Object.assign(c, structuredClone(update));
  }
  async delete(id: string, userId: string): Promise<boolean> {
    if (this.map.get(id)?.userId !== userId) return false;
    return this.map.delete(id);
  }
}

/** See {@link MemoryCredentialStore} for limitations. `consume` is atomic within one process. */
export class MemoryChallengeStore implements ChallengeStore {
  private readonly map = new Map<string, ChallengeRecord>();

  async save(r: ChallengeRecord): Promise<void> {
    this.map.set(r.challenge, { ...r });
  }
  async consume(challenge: string): Promise<ChallengeRecord | null> {
    // Synchronous get+delete: no await between them, so it is atomic on the event loop.
    const r = this.map.get(challenge) ?? null;
    this.map.delete(challenge);
    return r;
  }
  async deleteExpired(now: number): Promise<void> {
    for (const [k, r] of this.map) if (r.expiresAt <= now) this.map.delete(k);
  }
}
