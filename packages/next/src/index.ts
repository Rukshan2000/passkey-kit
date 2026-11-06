import { createHandlers, handleFetchRequest, type HandlerOptions } from '@passkey-kit/core';

type RouteHandler<R> = (request: R) => Promise<Response>;

/**
 * Next.js App Router route handlers for every passkey endpoint. Put this in
 * `app/api/passkey/[...passkey]/route.ts`:
 *
 * @example
 * export const { GET, POST, DELETE } = createPasskeyRoute({
 *   passkey,
 *   getUser: async () => (await getSession())?.user ?? null,
 *   onAuthenticated: async (_req, result) => { await createSession(result.userId); return { verified: true }; },
 * });
 *
 * Routes: POST register/options, register/verify, login/options, login/verify,
 * reauth/options, reauth/verify; GET credentials; DELETE credentials/:id.
 */
export function createPasskeyRoute<R extends Request = Request>(options: HandlerOptions<R>) {
  const h = createHandlers<R>(options);
  const handle: RouteHandler<R> = async (request) =>
    (await handleFetchRequest(h, request, request)) ?? Response.json({ error: 'NOT_FOUND' }, { status: 404 });
  return { GET: handle, POST: handle, DELETE: handle };
}
