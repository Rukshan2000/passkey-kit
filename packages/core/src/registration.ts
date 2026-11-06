import { MetadataService, SettingsService, generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { challengeFromResponse, consumeChallenge } from './challenge.js';
import { PasskeyError } from './errors.js';
import type { ResolvedConfig } from './passkey.js';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationOptionsInput,
  RegistrationResult,
  RegistrationVerifyInput,
  StoredCredential,
} from './types.js';
import { assertString, fail } from './validate.js';
import { getAuthenticatorName } from './aaguid.js';
import { decodeAttestationObject } from '@simplewebauthn/server/helpers';

/**
 * Enforce the AAGUID allowlist. An AAGUID is only trustworthy when a certificate chain that
 * ends at a trusted root vouches for it. SimpleWebAuthn validates that chain, but SKIPS the
 * check when it has no root for the format and no metadata statement, so we also require one
 * of those. "none" and self attestation (no x5c) are rejected.
 */
async function checkAttestation(allowed: Set<string>, fmt: string, attestationObject: Uint8Array, aaguid: string) {
  const fail = (m: string): never => {
    throw new PasskeyError('AUTHENTICATOR_NOT_ALLOWED', m);
  };
  if (!allowed.has(aaguid.toLowerCase())) fail('Authenticator model is not allowed');
  const x5c =
    fmt === 'none'
      ? undefined
      : decodeAttestationObject(attestationObject as Uint8Array<ArrayBuffer>)
          .get('attStmt')
          .get('x5c');
  if (!x5c?.length) fail('Authenticator did not provide a certificate attestation');
  const anchored =
    (await MetadataService.getStatement(aaguid)) ||
    SettingsService.getRootCertificates({ identifier: fmt as Parameters<typeof SettingsService.getRootCertificates>[0]['identifier'] })
      .length > 0;
  if (!anchored) fail('No trusted root for this attestation; initialize MetadataService or set root certificates');
}

export class Registration {
  constructor(private readonly cfg: ResolvedConfig) {}

  /**
   * Create options for `navigator.credentials.create()` and store the challenge,
   * bound to this user and the registration ceremony. Existing credentials are excluded
   * so the same authenticator is not registered twice.
   */
  async generateOptions(input: RegistrationOptionsInput): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const userId = assertString(input?.userId, 'userId', 64);
    const username = assertString(input.username, 'username', 256);
    const displayName = input.displayName === undefined ? username : assertString(input.displayName, 'displayName', 256);
    const { cfg } = this;
    const userBytes = new TextEncoder().encode(userId);
    if (userBytes.length > 64) throw new PasskeyError('INVALID_INPUT', 'userId must be at most 64 bytes');

    const existing = await cfg.credentials.listByUser(userId);
    const options = await generateRegistrationOptions({
      rpName: cfg.rpName,
      rpID: cfg.rpID,
      userID: userBytes,
      userName: username,
      userDisplayName: displayName,
      timeout: cfg.timeoutMs,
      attestationType: cfg.attestationType,
      excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
      authenticatorSelection: {
        residentKey: cfg.residentKey,
        userVerification: cfg.userVerification,
        authenticatorAttachment: cfg.authenticatorAttachment,
      },
    });
    const now = cfg.now();
    await cfg.challenges.deleteExpired(now);
    await cfg.challenges.save({ challenge: options.challenge, ceremony: 'registration', userId, expiresAt: now + cfg.timeoutMs });
    return options;
  }

  /**
   * Verify an attestation response, consume its challenge, and persist the new credential.
   * Returns `{ verified: false, error }` for any client-caused failure; storage errors throw.
   */
  async verify(input: RegistrationVerifyInput): Promise<RegistrationResult> {
    try {
      const userId = assertString(input?.userId, 'userId', 64);
      const response = input.response;
      if (!response || typeof response !== 'object' || !response.response) fail('response is required');
      const challenge = challengeFromResponse(response.response.clientDataJSON);
      const { cfg } = this;
      const record = await consumeChallenge(cfg.challenges, challenge, 'registration', cfg.now(), userId);
      if (record.userId !== userId) throw new PasskeyError('CHALLENGE_MISMATCH', 'Challenge issued for a different user');

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response,
          expectedChallenge: record.challenge,
          expectedOrigin: cfg.expectedOrigins,
          expectedRPID: cfg.rpID,
          requireUserVerification: cfg.userVerification === 'required',
        });
      } catch (cause) {
        throw new PasskeyError('VERIFICATION_FAILED', 'Registration response failed verification', { cause });
      }
      if (!verification.verified) throw new PasskeyError('VERIFICATION_FAILED', 'Registration response failed verification');

      const info = verification.registrationInfo;
      if (cfg.allowedAuthenticators) await checkAttestation(cfg.allowedAuthenticators, info.fmt, info.attestationObject, info.aaguid);
      if (await cfg.credentials.findById(info.credential.id)) throw new PasskeyError('CREDENTIAL_EXISTS', 'Credential already registered');
      const credential: StoredCredential = {
        id: info.credential.id,
        userId,
        publicKey: info.credential.publicKey,
        counter: info.credential.counter,
        transports: info.credential.transports as StoredCredential['transports'],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        aaguid: info.aaguid,
        name: input.name?.slice(0, 128) ?? getAuthenticatorName(info.aaguid),
        createdAt: new Date(cfg.now()),
      };
      await cfg.credentials.create(credential);
      await cfg.hooks.onRegistered?.({ userId, credential });
      return { verified: true, credential };
    } catch (error) {
      if (error instanceof PasskeyError) return { verified: false, error };
      throw error;
    }
  }
}
