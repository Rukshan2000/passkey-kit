import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createHandlers, type HandlerOptions, type HandlerResponse } from '@passkey-kit/core';

export type PasskeyPluginOptions = HandlerOptions<FastifyRequest>;

/**
 * Fastify plugin with the same routes as @passkey-kit/express. Register with a prefix:
 * `app.register(passkeyPlugin, { prefix: '/auth/passkey', passkey, getUser, onAuthenticated })`.
 * Sessions are never created for you. Add @fastify/rate-limit in front of login routes.
 */
export const passkeyPlugin: FastifyPluginAsync<PasskeyPluginOptions> = async (app, options) => {
  const h = createHandlers(options);
  const route =
    (fn: (i: { req: FastifyRequest; body: unknown; params?: Record<string, string> }) => Promise<HandlerResponse>) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { status, body } = await fn({ req, body: req.body, params: req.params as Record<string, string> });
      reply.header('Cache-Control', 'no-store').code(status);
      return body === null ? reply.send() : reply.send(body);
    };
  const opts = { bodyLimit: 64 * 1024 };
  app.post('/register/options', opts, route(h.registrationOptions));
  app.post('/register/verify', opts, route(h.registrationVerify));
  app.post('/login/options', opts, route(h.authenticationOptions));
  app.post('/login/verify', opts, route(h.authenticationVerify));
  app.get('/credentials', route(h.listCredentials));
  app.delete('/credentials/:id', route(h.deleteCredential));
};

