// Plain node:http server using the framework-independent handlers.
// Identity comes from an `x-user-id` header ONLY to keep the example tiny:
// replace getUser with your real session lookup. Never trust such a header in production.
import { createServer } from 'node:http';
import { Passkey, createHandlers } from '@passkey-kit/core';
import { MemoryChallengeStore, MemoryCredentialStore } from '@passkey-kit/memory';

const PORT = Number(process.env.PORT ?? 3001);
const passkey = new Passkey({
  rpName: 'vanilla demo',
  rpID: 'localhost',
  origin: `http://localhost:${PORT}`,
  credentials: new MemoryCredentialStore(),
  challenges: new MemoryChallengeStore(),
});

const h = createHandlers({
  passkey,
  getUser: (req) => {
    const id = req.headers['x-user-id'];
    return typeof id === 'string' && id ? { id, username: id } : null;
  },
});

const routes = {
  'POST /register/options': h.registrationOptions,
  'POST /register/verify': h.registrationVerify,
  'POST /login/options': h.authenticationOptions,
  'POST /login/verify': h.authenticationVerify,
  'GET /credentials': h.listCredentials,
};

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    if ((size += c.length) > 64 * 1024) throw new Error('body too large');
    chunks.push(c);
  }
  try {
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  } catch {
    return {};
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const del = req.method === 'DELETE' && url.pathname.match(/^\/credentials\/([^/]+)$/);
    const handler = del ? h.deleteCredential : routes[`${req.method} ${url.pathname}`];
    if (!handler) return res.writeHead(404).end();
    const { status, body } = await handler({
      req,
      body: await readJson(req),
      params: del ? { id: decodeURIComponent(del[1]) } : undefined,
    });
    res
      .writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      .end(body === null ? undefined : JSON.stringify(body));
  } catch (e) {
    console.error('passkey request failed:', e instanceof Error ? e.message : e);
    res.writeHead(500).end();
  }
}).listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
