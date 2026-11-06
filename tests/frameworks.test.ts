import type { AddressInfo } from 'node:net';
import express from 'express';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Passkey } from '@passkey-kit/core';
import { MemoryChallengeStore, MemoryCredentialStore } from '@passkey-kit/memory';
import { passkeyRouter } from '@passkey-kit/express';
import { passkeyPlugin } from '@passkey-kit/fastify';
import { Hono } from 'hono';
import { passkeyRoutes } from '@passkey-kit/hono';
import { createPasskeyRoute } from '@passkey-kit/next';
import { VirtualAuthenticator } from './virtual-authenticator.js';

const ORIGIN = 'https://example.com';
const users: Record<string, string> = { alice: 'u-alice' };
const makePasskey = () =>
  new Passkey({
    rpName: 'T',
    rpID: 'example.com',
    origin: ORIGIN,
    credentials: new MemoryCredentialStore(),
    challenges: new MemoryChallengeStore(),
  });
// Test-only "session": the x-user header. Real apps use their own session.
const getUser = (req: { headers: Record<string, unknown> }) => {
  const id = req.headers['x-user'];
  return typeof id === 'string' ? { id, username: id } : null;
};
const common = {
  getUser,
  findUserIdByUsername: (n: string) => users[n] ?? null,
  onAuthenticated: (_req: unknown, r: { userId: string }) => ({ ok: true, session: `session-for-${r.userId}` }),
};

type Call = (method: string, path: string, body?: unknown, user?: string) => Promise<{ status: number; body: any }>;

function suite(name: string, start: () => Promise<{ call: Call; close: () => Promise<void> }>) {
  describe(name, () => {
    let call: Call;
    let close: () => Promise<void>;
    beforeAll(async () => ({ call, close } = await start()));
    afterAll(() => close());
    const a = new VirtualAuthenticator({ origin: ORIGIN });

    it('requires a signed-in user to register', async () => {
      expect((await call('POST', '/register/options')).status).toBe(401);
    });

    it('register -> list -> login (username-first and usernameless) -> delete', async () => {
      const opts = await call('POST', '/register/options', {}, 'u-alice');
      expect(opts.status).toBe(200);
      const reg = await call('POST', '/register/verify', { response: a.create(opts.body), name: 'Laptop' }, 'u-alice');
      expect(reg).toMatchObject({ status: 200, body: { verified: true, credential: { name: 'Laptop' } } });
      expect(reg.body.credential.publicKey).toBeUndefined();

      const list = await call('GET', '/credentials', undefined, 'u-alice');
      expect(list.body).toHaveLength(1);

      const lo = await call('POST', '/login/options', { username: 'alice' });
      expect(lo.body.allowCredentials).toHaveLength(1);
      const login = await call('POST', '/login/verify', { response: a.get(lo.body) });
      expect(login).toEqual({ status: 200, body: { ok: true, session: 'session-for-u-alice' } });

      const anon = await call('POST', '/login/options', { username: 'nobody' });
      expect(anon.body.allowCredentials).toBeUndefined();
      expect((await call('POST', '/login/verify', { response: a.get(anon.body) })).status).toBe(200);

      expect((await call('DELETE', `/credentials/${list.body[0].id}`, undefined, 'u-mallory')).status).toBe(404);
      const del = await call('DELETE', `/credentials/${list.body[0].id}`, undefined, 'u-alice');
      expect(del.status).toBe(200);
      expect(del.body.signal).toMatchObject({ signalName: 'allAcceptedCredentials', rpID: 'example.com', allAcceptedCredentialIDs: [] });
      const after = await call('POST', '/login/options', {});
      const gone = await call('POST', '/login/verify', { response: a.get(after.body) });
      expect(gone).toMatchObject({ status: 401, body: { error: 'CREDENTIAL_NOT_FOUND', signal: { signalName: 'unknownCredential' } } });
    });

    it('rejects garbage input with 400/401 and an error code only', async () => {
      const r = await call('POST', '/login/verify', { response: 'x' });
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ verified: false, error: 'INVALID_INPUT' });
    });
  });
}

suite('express', async () => {
  const app = express();
  app.use('/pk', passkeyRouter({ passkey: makePasskey(), ...common }));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/pk`;
  const call: Call = async (method, path, body, user) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { call, close: () => new Promise<void>((r) => server.close(() => r())) };
});

suite('fastify', async () => {
  const app = Fastify();
  await app.register(passkeyPlugin, { prefix: '/pk', passkey: makePasskey(), ...common });
  const call: Call = async (method, path, body, user) => {
    const res = await app.inject({
      method: method as 'GET',
      url: '/pk' + path,
      payload: body as object,
      headers: user ? { 'x-user': user } : {},
    });
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  };
  return { call, close: () => app.close() };
});

// Shared by the fetch-based integrations: send a web Request through `fetchFn`.
const fetchCall =
  (fetchFn: (r: Request) => Response | Promise<Response>): Call =>
  async (method, path, body, user) => {
    const res = await fetchFn(
      new Request(`https://example.com/pk${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
const headerReq = (get: (name: string) => string | undefined | null) => ({ headers: { 'x-user': get('x-user') ?? undefined } });

suite('hono', async () => {
  const app = new Hono();
  app.route('/pk', passkeyRoutes({ passkey: makePasskey(), ...common, getUser: (c) => getUser(headerReq((n) => c.req.header(n))) }));
  return { call: fetchCall((r) => app.request(r)), close: async () => {} };
});

suite('next', async () => {
  const route = createPasskeyRoute({ passkey: makePasskey(), ...common, getUser: (req) => getUser(headerReq((n) => req.headers.get(n))) });
  return { call: fetchCall((r) => route[r.method as 'GET' | 'POST' | 'DELETE'](r)), close: async () => {} };
});

describe('fetch handler hardening', () => {
  const route = createPasskeyRoute({ passkey: makePasskey(), ...common, getUser: () => null });
  const post = (body: BodyInit, headers: Record<string, string> = {}) =>
    route.POST(new Request('https://example.com/pk/login/verify', { method: 'POST', headers, body }));

  it('rejects non-JSON bodies (login CSRF via text/plain simple request)', async () => {
    const res = await post(JSON.stringify({ response: {} }), { 'content-type': 'text/plain' });
    expect(res.status).toBe(415);
  });

  it('rejects oversized bodies by bytes, including multi-byte characters', async () => {
    const res = await post('"' + 'é'.repeat(40 * 1024) + '"', { 'content-type': 'application/json' });
    expect(res.status).toBe(413);
  });

  it('rejects oversized streamed bodies without content-length', async () => {
    const stream = new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(16 * 1024));
      },
    });
    const req = new Request('https://example.com/pk/login/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect((await route.POST(req)).status).toBe(413);
  });
});

describe('routing edge cases', () => {
  it('malformed percent-encoding in a credential id is a 404, not a crash', async () => {
    const route = createPasskeyRoute({ passkey: makePasskey(), ...common, getUser: () => ({ id: 'u', username: 'u' }) });
    const res = await route.DELETE(new Request('https://example.com/pk/credentials/%E0', { method: 'DELETE' }));
    expect(res.status).toBe(404);
  });

  it('fastify serves /.well-known/webauthn', async () => {
    const app = Fastify();
    const passkey = new Passkey({
      rpName: 'T',
      rpID: 'example.com',
      origin: 'https://example.com',
      relatedOrigins: ['https://example.co.uk'],
      credentials: new MemoryCredentialStore(),
      challenges: new MemoryChallengeStore(),
    });
    await app.register(passkeyPlugin, { passkey, getUser: () => null });
    const res = await app.inject({ method: 'GET', url: '/.well-known/webauthn' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ origins: ['https://example.com', 'https://example.co.uk'] });
    await app.close();
  });
});
