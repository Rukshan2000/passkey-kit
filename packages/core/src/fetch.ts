import type { PasskeyHandlers } from './handlers.js';

const MAX_BODY = 64 * 1024;

/**
 * Serve a passkey route from a web-standard `Request` (Next.js, Hono, Bun, Deno, Workers).
 * Routes match on the end of the URL path, so mount anywhere. Returns null when no route
 * matches. `ctx` is what your `getUser` / `onAuthenticated` callbacks receive.
 */
export async function handleFetchRequest<Ctx>(handlers: PasskeyHandlers<Ctx>, request: Request, ctx: Ctx): Promise<Response | null> {
  const found = handlers.match(request.method, new URL(request.url).pathname);
  if (!found) return null;
  let body: unknown = {};
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    const text = await request.text();
    if (text.length > MAX_BODY) return Response.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413 });
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
  }
  const { status, body: out } = await found.handler({ req: ctx, body, params: found.params });
  const headers = { 'cache-control': 'no-store' };
  return out === null ? new Response(null, { status, headers }) : Response.json(out, { status, headers });
}
