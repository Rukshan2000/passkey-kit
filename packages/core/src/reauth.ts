import { PasskeyError } from './errors.js';

/**
 * Step-up check: throws `REAUTH_REQUIRED` unless the user verified a passkey within
 * `maxAgeMs`. Pass the `authenticatedAt` you stored in the session after sign-in or
 * after a `/reauth/verify`.
 *
 * @example
 * requireRecentAuth(req.session.authenticatedAt, 5 * 60_000); // before changing an email
 */
export function requireRecentAuth(authenticatedAt: Date | number | string | null | undefined, maxAgeMs: number, now = Date.now()): void {
  const t = authenticatedAt == null ? NaN : new Date(authenticatedAt).getTime();
  if (!(t <= now && now - t <= maxAgeMs)) throw new PasskeyError('REAUTH_REQUIRED', 'Recent passkey verification required');
}
