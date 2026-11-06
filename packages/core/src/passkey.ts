import { Authentication } from './authentication.js';
import { CredentialManager } from './credential.js';
import { PasskeyError } from './errors.js';
import { Registration } from './registration.js';
import type { PasskeyConfig } from './types.js';

export type ResolvedConfig = Required<Omit<PasskeyConfig, 'authenticatorAttachment'>> &
  Pick<PasskeyConfig, 'authenticatorAttachment'>;

function invalid(message: string): never {
  throw new PasskeyError('INVALID_CONFIG', message);
}

function resolve(config: PasskeyConfig): ResolvedConfig {
  if (!config || typeof config !== 'object') invalid('config is required');
  const { rpName, rpID, origin, credentials, challenges } = config;
  if (!rpName) invalid('rpName is required');
  if (!rpID || /[:/]/.test(rpID)) invalid('rpID must be a bare domain like "example.com"');
  const origins = Array.isArray(origin) ? origin : [origin];
  if (origins.length === 0) invalid('origin is required');
  for (const o of origins) {
    let url: URL;
    try {
      url = new URL(o);
    } catch {
      invalid(`origin "${o}" is not a valid URL`);
    }
    if (url.origin !== o) invalid(`origin "${o}" must be scheme://host[:port] with no path`);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') invalid(`origin "${o}" must use https (except localhost)`);
    if (url.hostname !== rpID && !url.hostname.endsWith(`.${rpID}`)) invalid(`origin "${o}" is not within rpID "${rpID}"`);
  }
  if (!credentials || !challenges) invalid('credentials and challenges stores are required');
  const timeoutMs = config.timeoutMs ?? 5 * 60_000;
  if (!(timeoutMs > 0)) invalid('timeoutMs must be positive');
  return {
    ...config,
    origin: origins,
    userVerification: config.userVerification ?? 'preferred',
    residentKey: config.residentKey ?? 'required',
    attestationType: config.attestationType ?? 'none',
    timeoutMs,
    now: config.now ?? Date.now,
  };
}

/**
 * Entry point. Validates configuration once and exposes the registration,
 * authentication and credential-management APIs.
 *
 * @example
 * const passkey = new Passkey({ rpName: 'App', rpID: 'example.com', origin: 'https://example.com', credentials, challenges });
 */
export class Passkey {
  readonly registration: Registration;
  readonly authentication: Authentication;
  readonly credentials: CredentialManager;

  constructor(config: PasskeyConfig) {
    const cfg = resolve(config);
    this.registration = new Registration(cfg);
    this.authentication = new Authentication(cfg);
    this.credentials = new CredentialManager(cfg.credentials);
  }
}
