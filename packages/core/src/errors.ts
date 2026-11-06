export type PasskeyErrorCode =
  | 'INVALID_CONFIG'
  | 'INVALID_INPUT'
  | 'CHALLENGE_NOT_FOUND'
  | 'CHALLENGE_EXPIRED'
  | 'CHALLENGE_MISMATCH'
  | 'CREDENTIAL_NOT_FOUND'
  | 'CREDENTIAL_EXISTS'
  | 'CREDENTIAL_OWNER_MISMATCH'
  | 'VERIFICATION_FAILED'
  | 'REAUTH_REQUIRED'
  | 'AUTHENTICATOR_NOT_ALLOWED';

/**
 * All errors thrown or returned by passkey-kit. `message` never contains challenges,
 * keys or raw responses, so it is safe to log. Send only `code` to clients.
 */
export class PasskeyError extends Error {
  override readonly name = 'PasskeyError';
  constructor(
    readonly code: PasskeyErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
