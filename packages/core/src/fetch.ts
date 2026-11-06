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
    // Only JSON: a text/plain or form POST is a CORS "simple request" that skips preflight,
    // which would allow cross-site login CSRF.
    const text = await readCapped(request, MAX_BODY);
    if (text === null) return Response.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413 });
    const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (text && type !== 'application/json') return Response.json({ error: 'UNSUPPORTED_MEDIA_TYPE' }, { status: 415 });
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

/** Read the body as UTF-8, or null once it exceeds `max` bytes (without buffering the rest). */
async function readCapped(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
