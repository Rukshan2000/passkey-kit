import { Hono, type Context, type Env } from 'hono';
import { createHandlers, handleFetchRequest, requireRecentAuth as checkRecentAuth, type HandlerOptions } from '@passkey-kit/core';
import { createMiddleware } from 'hono/factory';

/**
 * Hono sub-app with every passkey endpoint. Callbacks receive the Hono `Context`, so read
 * your session with `c.get(...)`.
 *
 * @example
 * app.route('/auth/passkey', passkeyRoutes({ passkey, getUser: (c) => c.get('user') ?? null }));
 */
export function passkeyRoutes<E extends Env = Env>(options: HandlerOptions<Context<E>>): Hono<E> {
  const h = createHandlers<Context<E>>(options);
  const app = new Hono<E>();
  app.all('*', async (c) => (await handleFetchRequest(h, c.req.raw, c)) ?? c.notFound());
  return app;
}

/** Middleware for sensitive routes: 401 `{ error: 'REAUTH_REQUIRED' }` unless a passkey was verified within `maxAgeMs`. */
export function requireRecentAuth<E extends Env = Env>(opts: {
  maxAgeMs: number;
  getAuthenticatedAt(c: Context<E>): Date | number | string | null | undefined;
}) {
  return createMiddleware<E>(async (c, next) => {
    try {
      checkRecentAuth(opts.getAuthenticatedAt(c), opts.maxAgeMs);
    } catch {
      return c.json({ error: 'REAUTH_REQUIRED' }, 401);
    }
    await next();
  });
}
