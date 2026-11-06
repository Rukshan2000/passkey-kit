import { PasskeyError } from './errors.js';
import type { CredentialStore, StoredCredential } from './types.js';

/** Credential management bound to a user. Every operation enforces ownership. */
export class CredentialManager {
  constructor(private readonly store: CredentialStore) {}

  /** List a user's passkeys. */
  list(userId: string): Promise<StoredCredential[]> {
    return this.store.listByUser(userId);
  }

  /** Rename a passkey owned by `userId`. */
  async rename(userId: string, credentialId: string, name: string): Promise<void> {
    await this.owned(userId, credentialId);
    await this.store.update(credentialId, { name: name.slice(0, 128) });
  }

  /** Revoke (delete) a passkey owned by `userId`. Throws if not found or not owned. */
  async delete(userId: string, credentialId: string): Promise<void> {
    if (!(await this.store.delete(credentialId, userId)))
      throw new PasskeyError('CREDENTIAL_NOT_FOUND', 'Credential not found');
  }

  private async owned(userId: string, credentialId: string): Promise<StoredCredential> {
    const cred = await this.store.findById(credentialId);
    // Same error for "missing" and "someone else's" to avoid leaking existence.
    if (!cred || cred.userId !== userId) throw new PasskeyError('CREDENTIAL_NOT_FOUND', 'Credential not found');
    return cred;
  }
}
