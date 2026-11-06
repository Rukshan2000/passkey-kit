import express, { type Request, type Response, type Router } from 'express';
import { createHandlers, type HandlerOptions, type HandlerResponse } from '@passkey-kit/core';

/**
 * Express router exposing passkey endpoints (mount it e.g. at `/auth/passkey`):
 *
 * - `POST   /register/options`   (signed-in)  -> creation options
 * - `POST   /register/verify`    (signed-in)  `{ response, name? }`
 * - `POST   /login/options`      `{ username? }` -> request options
 * - `POST   /login/verify`       `{ response }` -> calls `onAuthenticated`
 * - `GET    /credentials`        (signed-in)
 * - `DELETE /credentials/:id`    (signed-in)
 *
 * Sessions are never created for you; do that in `onAuthenticated`.
 * Add rate limiting (e.g. express-rate-limit) in front of the login routes.
 */
export function passkeyRouter(options: HandlerOptions<Request>): Router {
  const h = createHandlers(options);
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));

  const route = (fn: (i: { req: Request; body: unknown; params?: Record<string, string> }) => Promise<HandlerResponse>) =>
    async (req: Request, res: Response, next: (e?: unknown) => void) => {
      try {
        const { status, body } = await fn({ req, body: req.body, params: req.params as Record<string, string> });
        res.set('Cache-Control', 'no-store');
        if (body === null) res.status(status).end();
        else res.status(status).json(body);
      } catch (e) {
        next(e);
      }
    };

  router.post('/register/options', route(h.registrationOptions));
  router.post('/register/verify', route(h.registrationVerify));
  router.post('/login/options', route(h.authenticationOptions));
  router.post('/login/verify', route(h.authenticationVerify));
  router.get('/credentials', route(h.listCredentials));
  router.delete('/credentials/:id', route(h.deleteCredential));
  return router;
}
