import { PasskeyError } from './errors.js';
import type { ResolvedConfig } from './passkey.js';
import type { PasskeySignal, StoredCredential } from './types.js';

/** The user handle sent to authenticators: the UTF-8 bytes of the app's user ID, base64url. */
export const userHandle = (userId: string) => Buffer.from(userId, 'utf8').toString('base64url');

/** Credential management bound to a user. Every operation enforces ownership. */
export class CredentialManager {
  constructor(private readonly cfg: ResolvedConfig) {}

  /** List a user's passkeys. */
  list(userId: string): Promise<StoredCredential[]> {
    return this.cfg.credentials.listByUser(userId);
  }

  /** Rename a passkey owned by `userId`. */
  async rename(userId: string, credentialId: string, name: string): Promise<void> {
    const cred = await this.cfg.credentials.findById(credentialId);
    // Same error for "missing" and "someone else's" to avoid leaking existence.
    if (!cred || cred.userId !== userId) throw new PasskeyError('CREDENTIAL_NOT_FOUND', 'Credential not found');
    await this.cfg.credentials.update(credentialId, { name: name.slice(0, 128) });
  }

  /** Revoke (delete) a passkey owned by `userId`. Throws if not found or not owned. */
  async delete(userId: string, credentialId: string): Promise<void> {
    if (!(await this.cfg.credentials.delete(credentialId, userId))) throw new PasskeyError('CREDENTIAL_NOT_FOUND', 'Credential not found');
    await this.cfg.hooks.onCredentialDeleted?.({ userId, credentialId });
  }

  /** Signal for a credential ID this server doesn't know (e.g. after a failed login with a deleted passkey). */
  unknownCredentialSignal(credentialId: string): PasskeySignal {
    return { signalName: 'unknownCredential', rpID: this.cfg.rpID, credentialID: credentialId };
  }

  /** Signal listing every passkey the user still has, so password managers can hide the rest. */
  async acceptedCredentialsSignal(userId: string): Promise<PasskeySignal> {
    const ids = (await this.list(userId)).map((c) => c.id);
    return { signalName: 'allAcceptedCredentials', rpID: this.cfg.rpID, userID: userHandle(userId), allAcceptedCredentialIDs: ids };
  }

  /** Signal to update the account name shown in password managers. */
  userDetailsSignal(user: { id: string; username: string; displayName?: string }): PasskeySignal {
    return {
      signalName: 'currentUserDetails',
      rpID: this.cfg.rpID,
      userID: userHandle(user.id),
      userName: user.username,
      userDisplayName: user.displayName ?? user.username,
    };
  }
}
