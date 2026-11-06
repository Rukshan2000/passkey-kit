import { verifyAuthenticationResponse, generateAuthenticationOptions } from '@simplewebauthn/server';
import { challengeFromResponse, consumeChallenge } from './challenge.js';
import { PasskeyError } from './errors.js';
import type { ResolvedConfig } from './passkey.js';
import type {
  AuthenticationOptionsInput,
  AuthenticationResult,
  AuthenticationVerifyInput,
  PublicKeyCredentialRequestOptionsJSON,
} from './types.js';
import { MAX_CREDENTIAL_ID, assertString, fail } from './validate.js';

export class Authentication {
  constructor(private readonly cfg: ResolvedConfig) {}

  /**
   * Create options for `navigator.credentials.get()`.
   * With `userId`: username-first, `allowCredentials` lists that user's passkeys.
   * Without: usernameless, the authenticator picks a discoverable credential.
   */
  async generateOptions(input: AuthenticationOptionsInput = {}): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const userId = input.userId === undefined ? undefined : assertString(input.userId, 'userId', 64);
    const { cfg } = this;
    const allowCredentials = userId
      ? (await cfg.credentials.listByUser(userId)).map((c) => ({ id: c.id, transports: c.transports }))
      : undefined;
    const options = await generateAuthenticationOptions({
      rpID: cfg.rpID,
      allowCredentials,
      timeout: cfg.timeoutMs,
      userVerification: cfg.userVerification,
    });
    const now = cfg.now();
    await cfg.challenges.deleteExpired(now);
    await cfg.challenges.save({ challenge: options.challenge, ceremony: 'authentication', userId, expiresAt: now + cfg.timeoutMs });
    return options;
  }

  /**
   * Verify an assertion. The user is derived from the stored credential, never from the
   * client. If the challenge was bound to a user, or `userId` is passed, the credential
   * must belong to that user. The signature counter is updated on success.
   */
  async verify(input: AuthenticationVerifyInput): Promise<AuthenticationResult> {
    try {
      const response = input?.response;
      if (!response || typeof response !== 'object' || !response.response) fail('response is required');
      const expectedUser = input.userId === undefined ? undefined : assertString(input.userId, 'userId', 64);
      const credentialId = assertString(response.id, 'response.id', MAX_CREDENTIAL_ID);
      const challenge = challengeFromResponse(response.response.clientDataJSON);
      const { cfg } = this;
      const record = await consumeChallenge(cfg.challenges, challenge, 'authentication', cfg.now(), expectedUser);

      const credential = await cfg.credentials.findById(credentialId);
      if (!credential) throw new PasskeyError('CREDENTIAL_NOT_FOUND', 'Unknown credential');
      const owner = record.userId ?? expectedUser;
      if (owner !== undefined && credential.userId !== owner)
        throw new PasskeyError('CREDENTIAL_OWNER_MISMATCH', 'Credential does not belong to this user');
      // For discoverable credentials the authenticator returns the user handle we set at registration.
      const handle = response.response.userHandle;
      if (handle && Buffer.from(handle, 'base64url').toString('utf8') !== credential.userId)
        throw new PasskeyError('CREDENTIAL_OWNER_MISMATCH', 'User handle does not match credential owner');

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: record.challenge,
          expectedOrigin: cfg.expectedOrigins,
          expectedRPID: cfg.rpID,
          credential: {
            id: credential.id,
            publicKey: credential.publicKey,
            counter: credential.counter,
            transports: credential.transports,
          },
          requireUserVerification: cfg.userVerification === 'required',
        });
      } catch (cause) {
        // Includes counter regressions (possible cloned authenticator).
        throw new PasskeyError('VERIFICATION_FAILED', 'Authentication response failed verification', { cause });
      }
      if (!verification.verified) throw new PasskeyError('VERIFICATION_FAILED', 'Authentication response failed verification');

      const info = verification.authenticationInfo;
      const authenticatedAt = new Date(cfg.now());
      const update = { counter: info.newCounter, backedUp: info.credentialBackedUp, lastUsedAt: authenticatedAt };
      await cfg.credentials.update(credential.id, update);
      const updated = { ...credential, ...update };
      await cfg.hooks.onLogin?.({ userId: credential.userId, credential: updated, userVerified: info.userVerified });
      return { verified: true, userId: credential.userId, credential: updated, userVerified: info.userVerified, authenticatedAt };
    } catch (error) {
      if (!(error instanceof PasskeyError)) throw error;
      const id = (input as { response?: { id?: unknown } } | undefined)?.response?.id;
      await this.cfg.hooks.onLoginFailed?.({ error, credentialId: typeof id === 'string' ? id.slice(0, MAX_CREDENTIAL_ID) : undefined });
      return { verified: false, error };
    }
  }
}
