import { Passkey } from './passkey.js';
import type { PasskeyConfig } from './types.js';

export interface TenantRegistry {
  /** The `Passkey` for a request's host (e.g. `req.hostname`), or null for unknown hosts. */
  forHost(host: string | undefined | null): Promise<Passkey | null>;
  /** Drop a cached instance, e.g. after a tenant changes its domain. */
  invalidate(host: string): void;
}

/**
 * Multi-tenant support: one `Passkey` per customer domain, created on first use and cached.
 * `resolve` returns that tenant's config (its own rpID and origins), or null to reject the host.
 * Passkeys are bound to their rpID, so one tenant's passkeys can never sign in to another.
 *
 * @example
 * const tenants = createTenantRegistry(async (host) => {
 *   const t = await db.tenants.findByDomain(host);
 *   return t && { rpName: t.name, rpID: t.domain, origin: `https://${t.domain}`, credentials, challenges };
 * });
 * passkeyRouter({ passkey: (req) => tenants.forHost(req.hostname), getUser });
 */
export function createTenantRegistry(resolve: (host: string) => PasskeyConfig | null | Promise<PasskeyConfig | null>): TenantRegistry {
  const cache = new Map<string, Promise<Passkey | null>>();
  return {
    forHost(host) {
      const key = host?.toLowerCase().replace(/:\d+$/, '');
      if (!key || key.length > 253 || !/^[a-z0-9.-]+$/.test(key)) return Promise.resolve(null);
      let p = cache.get(key);
      if (!p) {
        p = Promise.resolve(resolve(key)).then((cfg) => (cfg ? new Passkey(cfg) : null));
        // Don't cache failures or unknown hosts, so a new tenant works without a restart.
        p.then(
          (v) => v ?? cache.delete(key),
          () => cache.delete(key),
        );
        cache.set(key, p);
      }
      return p;
    },
    invalidate(host) {
      cache.delete(host.toLowerCase());
    },
  };
}
