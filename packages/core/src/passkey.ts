import { Authentication } from './authentication.js';
import { CredentialManager } from './credential.js';
import { PasskeyError } from './errors.js';
import { Registration } from './registration.js';
import type { PasskeyConfig } from './types.js';

export type ResolvedConfig = Required<Omit<PasskeyConfig, 'authenticatorAttachment' | 'allowedAuthenticators' | 'origin'>> &
  Pick<PasskeyConfig, 'authenticatorAttachment'> & {
    /** Primary origins (within rpID). */
    origin: string[];
    /** Every origin accepted during verification: `origin` plus `relatedOrigins`. */
    expectedOrigins: string[];
    allowedAuthenticators?: Set<string>;
  };

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
  const checkOrigin = (o: string, related: boolean) => {
    let url: URL;
    try {
      url = new URL(o);
    } catch {
      invalid(`origin "${o}" is not a valid URL`);
    }
    if (url.origin !== o) invalid(`origin "${o}" must be scheme://host[:port] with no path`);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') invalid(`origin "${o}" must use https (except localhost)`);
    const inside = url.hostname === rpID || url.hostname.endsWith(`.${rpID}`);
    if (!related && !inside) invalid(`origin "${o}" is not within rpID "${rpID}"; list it in relatedOrigins instead`);
    if (related && inside) invalid(`related origin "${o}" is within rpID "${rpID}"; list it in origin instead`);
  };
  for (const o of origins) checkOrigin(o, false);
  const relatedOrigins = config.relatedOrigins ?? [];
  if (!Array.isArray(relatedOrigins)) invalid('relatedOrigins must be an array');
  for (const o of relatedOrigins) checkOrigin(o, true);

  let allowedAuthenticators: Set<string> | undefined;
  if (config.allowedAuthenticators) {
    if (config.attestationType !== 'direct' && config.attestationType !== 'enterprise')
      invalid("allowedAuthenticators requires attestationType 'direct' or 'enterprise'");
    allowedAuthenticators = new Set(config.allowedAuthenticators.map((a) => a.toLowerCase()));
    if (allowedAuthenticators.size === 0) invalid('allowedAuthenticators must not be empty');
  }
  if (!credentials || !challenges) invalid('credentials and challenges stores are required');
  const timeoutMs = config.timeoutMs ?? 5 * 60_000;
  if (!(timeoutMs > 0)) invalid('timeoutMs must be positive');
  return {
    ...config,
    origin: origins,
    relatedOrigins,
    expectedOrigins: [...origins, ...relatedOrigins],
    allowedAuthenticators,
    userVerification: config.userVerification ?? 'required',
    residentKey: config.residentKey ?? 'required',
    attestationType: config.attestationType ?? 'none',
    timeoutMs,
    hooks: config.hooks ?? {},
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
  /** The relying party ID this instance serves. */
  readonly rpID: string;
  private readonly cfg: ResolvedConfig;

  constructor(config: PasskeyConfig) {
    const cfg = resolve(config);
    this.cfg = cfg;
    this.rpID = cfg.rpID;
    this.registration = new Registration(cfg);
    this.authentication = new Authentication(cfg);
    this.credentials = new CredentialManager(cfg);
  }

  /**
   * The JSON to serve at `https://<rpID>/.well-known/webauthn` when `relatedOrigins` is set,
   * or null if there are none.
   */
  wellKnownWebauthn(): { origins: string[] } | null {
    return this.cfg.relatedOrigins.length ? { origins: this.cfg.expectedOrigins } : null;
  }
}
