import { PasskeyError } from './errors.js';

/** Max credential ID length: 1023 bytes (WebAuthn spec) is 1364 base64url characters. */
export const MAX_CREDENTIAL_ID = 1364;

export function fail(message: string): never {
  throw new PasskeyError('INVALID_INPUT', message);
}

export function assertString(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) fail(`${name} must be a non-empty string (max ${max})`);
  return value;
}
