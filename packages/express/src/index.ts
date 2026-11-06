import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { createHandlers, requireRecentAuth as checkRecentAuth, PasskeyError, type HandlerOptions } from '@passkey-kit/core';

/**
 * Express router exposing passkey endpoints (mount it e.g. at `/auth/passkey`):
 *
 * - `POST   /register/options`   (signed-in)  -> creation options
 * - `POST   /register/verify`    (signed-in)  `{ response, name? }`
 * - `POST   /login/options`      `{ username? }` -> request options
 * - `POST   /login/verify`       `{ response }` -> calls `onAuthenticated`
 * - `POST   /reauth/options`     (signed-in)  step-up options
 * - `POST   /reauth/verify`      (signed-in)  `{ response }` -> calls `onReauthenticated`
 * - `GET    /credentials`        (signed-in)
 * - `DELETE /credentials/:id`    (signed-in)  -> `{ deleted, signal }`
 *
 * Sessions are never created for you; do that in `onAuthenticated`.
 * Limit request rates with the `rateLimit` option or a middleware such as express-rate-limit.
 */
export function passkeyRouter(options: HandlerOptions<Request>): Router {
  const h = createHandlers(options);
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));
  router.use(async (req: Request, res: Response, next: NextFunction) => {
    const found = h.match(req.method, req.path);
    if (!found) return next();
    try {
      const { status, body } = await found.handler({ req, body: req.body, params: found.params });
      res.set('Cache-Control', 'no-store');
      if (body === null) res.status(status).end();
      else res.status(status).json(body);
    } catch (e) {
      next(e);
    }
  });
  return router;
}

/**
 * Middleware for sensitive routes: responds 401 `{ error: 'REAUTH_REQUIRED' }` unless the
 * user verified a passkey within `maxAgeMs`. Have the client call `/reauth/*`, then retry.
 *
 * @example
 * app.post('/account/email', requireRecentAuth({ maxAgeMs: 5 * 60_000, getAuthenticatedAt: (req) => req.session.authenticatedAt }), handler);
 */
export function requireRecentAuth(opts: { maxAgeMs: number; getAuthenticatedAt(req: Request): Date | number | string | null | undefined }) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      checkRecentAuth(opts.getAuthenticatedAt(req), opts.maxAgeMs);
      next();
    } catch (e) {
      if (e instanceof PasskeyError) res.status(401).json({ error: e.code });
      else next(e);
    }
  };
}
