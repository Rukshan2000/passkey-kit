import type { AddressInfo } from 'node:net';
import express from 'express';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Passkey } from '@passkey-kit/core';
import { MemoryChallengeStore, MemoryCredentialStore } from '@passkey-kit/memory';
import { passkeyRouter } from '@passkey-kit/express';
import { passkeyPlugin } from '@passkey-kit/fastify';
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
      expect((await call('DELETE', `/credentials/${list.body[0].id}`, undefined, 'u-alice')).status).toBe(204);
      const after = await call('POST', '/login/options', {});
      expect(await call('POST', '/login/verify', { response: a.get(after.body) })).toMatchObject({
        status: 401,
        body: { error: 'CREDENTIAL_NOT_FOUND' },
      });
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
