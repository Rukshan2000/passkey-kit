import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createHandlers, requireRecentAuth as checkRecentAuth, type HandlerOptions } from '@passkey-kit/core';

export type PasskeyPluginOptions = HandlerOptions<FastifyRequest>;

/**
 * Fastify plugin with the same routes as @passkey-kit/express. Register with a prefix:
 * `app.register(passkeyPlugin, { prefix: '/auth/passkey', passkey, getUser, onAuthenticated })`.
 * Sessions are never created for you. Use the `rateLimit` option or @fastify/rate-limit.
 */
export const passkeyPlugin: FastifyPluginAsync<PasskeyPluginOptions> = async (app, options) => {
  const h = createHandlers(options);
  const routes: [method: 'GET' | 'POST' | 'DELETE', path: string][] = [
    ['POST', '/register/options'],
    ['POST', '/register/verify'],
    ['POST', '/login/options'],
    ['POST', '/login/verify'],
    ['POST', '/reauth/options'],
    ['POST', '/reauth/verify'],
    ['GET', '/credentials'],
    ['DELETE', '/credentials/:id'],
    ['GET', '/.well-known/webauthn'],
  ];
  for (const [method, path] of routes) {
    app.route({
      method,
      url: path,
      bodyLimit: 64 * 1024,
      handler: async (req: FastifyRequest, reply: FastifyReply) => {
        const found = h.match(method, req.url.split('?')[0]!)!;
        const { status, body } = await found.handler({ req, body: req.body, params: found.params });
        reply.header('Cache-Control', 'no-store').code(status);
        return body === null ? reply.send() : reply.send(body);
      },
    });
  }
};

/**
 * `preHandler` for sensitive routes: replies 401 `{ error: 'REAUTH_REQUIRED' }` unless the
 * user verified a passkey within `maxAgeMs`.
 *
 * @example
 * app.post('/account/email', { preHandler: requireRecentAuth({ maxAgeMs: 300_000, getAuthenticatedAt: (req) => req.session.get('authenticatedAt') }) }, handler);
 */
export function requireRecentAuth(opts: {
  maxAgeMs: number;
  getAuthenticatedAt(req: FastifyRequest): Date | number | string | null | undefined;
}) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      checkRecentAuth(opts.getAuthenticatedAt(req), opts.maxAgeMs);
    } catch {
      return reply.code(401).send({ error: 'REAUTH_REQUIRED' });
    }
  };
}
