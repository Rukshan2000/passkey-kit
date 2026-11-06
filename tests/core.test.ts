import { describe, expect, it } from 'vitest';
import { Passkey, PasskeyError, type PasskeyConfig } from '@passkey-kit/core';
import { MemoryChallengeStore, MemoryCredentialStore } from '@passkey-kit/memory';
import { VirtualAuthenticator } from './virtual-authenticator.js';

const ORIGIN = 'https://example.com';

function setup(extra: Partial<PasskeyConfig> = {}) {
  const clock = { t: 1_000_000 };
  const credentials = new MemoryCredentialStore();
  const challenges = new MemoryChallengeStore();
  const passkey = new Passkey({
    rpName: 'Test', rpID: 'example.com', origin: ORIGIN, credentials, challenges, now: () => clock.t, ...extra,
  });
  return { passkey, credentials, challenges, clock, auth: new VirtualAuthenticator({ origin: ORIGIN }) };
}

async function register(s: ReturnType<typeof setup>, userId = 'user-1', auth = s.auth) {
  const opts = await s.passkey.registration.generateOptions({ userId, username: `${userId}@example.com` });
  const result = await s.passkey.registration.verify({ userId, response: auth.create(opts) });
  if (!result.verified) throw result.error;
  return result.credential;
}

const code = (r: { verified: boolean; error?: PasskeyError }) => (r.verified ? 'OK' : r.error!.code);

describe('config validation', () => {
  const base = { rpName: 'x', rpID: 'example.com', origin: ORIGIN, credentials: new MemoryCredentialStore(), challenges: new MemoryChallengeStore() };
  it.each([
    [{ rpID: 'https://example.com' }],
    [{ origin: 'http://example.com' }],
    [{ origin: 'https://evil.com' }],
    [{ origin: 'https://example.com/path' }],
    [{ rpName: '' }],
    [{ challenges: undefined }],
  ])('rejects %o', (bad) => {
    expect(() => new Passkey({ ...base, ...bad } as PasskeyConfig)).toThrow(PasskeyError);
  });
  it('allows localhost over http', () => {
    expect(() => new Passkey({ ...base, rpID: 'localhost', origin: 'http://localhost:3000' })).not.toThrow();
  });
});

describe('registration', () => {
  it('registers and stores a credential', async () => {
    const s = setup();
    const cred = await register(s);
    expect(cred.userId).toBe('user-1');
    expect(cred.publicKey).toBeInstanceOf(Uint8Array);
    expect(await s.credentials.listByUser('user-1')).toHaveLength(1);
  });

  it('generates unique random challenges bound to user', async () => {
    const s = setup();
    const a = await s.passkey.registration.generateOptions({ userId: 'u', username: 'u' });
    const b = await s.passkey.registration.generateOptions({ userId: 'u', username: 'u' });
    expect(a.challenge).not.toBe(b.challenge);
    expect(Buffer.from(a.challenge, 'base64url').length).toBeGreaterThanOrEqual(32);
    expect(a.authenticatorSelection?.residentKey).toBe('required');
  });

  it('rejects wrong origin', async () => {
    const s = setup();
    const opts = await s.passkey.registration.generateOptions({ userId: 'u', username: 'u' });
    const r = await s.passkey.registration.verify({ userId: 'u', response: s.auth.create(opts, { origin: 'https://evil.com' }) });
    expect(code(r)).toBe('VERIFICATION_FAILED');
  });

  it('rejects wrong RP ID', async () => {
    const s = setup();
    const opts = await s.passkey.registration.generateOptions({ userId: 'u', username: 'u' });
    const r = await s.passkey.registration.verify({ userId: 'u', response: s.auth.create(opts, { rpId: 'evil.com' }) });
    expect(code(r)).toBe('VERIFICATION_FAILED');
  });

  it('rejects a challenge issued to another user', async () => {
    const s = setup();
    const opts = await s.passkey.registration.generateOptions({ userId: 'alice', username: 'a' });
    const r = await s.passkey.registration.verify({ userId: 'mallory', response: s.auth.create(opts) });
    expect(code(r)).toBe('CHALLENGE_MISMATCH');
    expect(await s.credentials.listByUser('mallory')).toHaveLength(0);
  });

  it('rejects unknown, expired and reused challenges', async () => {
    const s = setup();
    const opts = await s.passkey.registration.generateOptions({ userId: 'u', username: 'u' });
    const resp = s.auth.create(opts);
    expect(code(await s.passkey.registration.verify({ userId: 'u', response: resp }))).toBe('OK');
    expect(code(await s.passkey.registration.verify({ userId: 'u', response: resp }))).toBe('CHALLENGE_NOT_FOUND');

    const opts2 = await s.passkey.registration.generateOptions({ userId: 'u', username: 'u' });
    s.clock.t += 5 * 60_000 + 1;
    const r = await s.passkey.registration.verify({ userId: 'u', response: s.auth.create(opts2) });
    expect(['CHALLENGE_EXPIRED', 'CHALLENGE_NOT_FOUND']).toContain(code(r));
  });

  it('rejects authentication challenge used for registration', async () => {
    const s = setup();
    const a = await s.passkey.authentication.generateOptions({ userId: 'u' });
    const opts = await s.passkey.registration.generateOptions({ userId: 'u', username: 'u' });
    const r = await s.passkey.registration.verify({ userId: 'u', response: s.auth.create({ ...opts, challenge: a.challenge }) });
    expect(code(r)).toBe('CHALLENGE_MISMATCH');
  });

  it('enforces user verification when required', async () => {
    const s = setup({ userVerification: 'required' });
    const noUV = new VirtualAuthenticator({ origin: ORIGIN, userVerified: false });
    const opts = await s.passkey.registration.generateOptions({ userId: 'u', username: 'u' });
    expect(code(await s.passkey.registration.verify({ userId: 'u', response: noUV.create(opts) }))).toBe('VERIFICATION_FAILED');
  });

  it('validates input', async () => {
    const s = setup();
    await expect(s.passkey.registration.generateOptions({ userId: '', username: 'x' })).rejects.toThrow(PasskeyError);
    expect(code(await s.passkey.registration.verify({ userId: 'u', response: null as never }))).toBe('INVALID_INPUT');
    expect(code(await s.passkey.registration.verify({ userId: 'u', response: { response: { clientDataJSON: '!!' } } as never }))).toBe('INVALID_INPUT');
  });

  it('excludes existing credentials and supports multiple devices', async () => {
    const s = setup();
    await register(s, 'u');
    await register(s, 'u', new VirtualAuthenticator({ origin: ORIGIN }));
    const opts = await s.passkey.registration.generateOptions({ userId: 'u', username: 'u' });
    expect(opts.excludeCredentials).toHaveLength(2);
    expect(await s.passkey.credentials.list('u')).toHaveLength(2);
  });
});

describe('authentication', () => {
  it('username-first login succeeds and updates counter', async () => {
    const s = setup();
    const cred = await register(s);
    const opts = await s.passkey.authentication.generateOptions({ userId: 'user-1' });
    expect(opts.allowCredentials?.map((c) => c.id)).toEqual([cred.id]);
    const r = await s.passkey.authentication.verify({ response: s.auth.get(opts) });
    expect(r.verified && r.userId).toBe('user-1');
    expect((await s.credentials.findById(cred.id))!.counter).toBe(2);
    expect((await s.credentials.findById(cred.id))!.lastUsedAt).toBeInstanceOf(Date);
  });

  it('usernameless login derives user from credential', async () => {
    const s = setup();
    await register(s, 'alice');
    const opts = await s.passkey.authentication.generateOptions();
    expect(opts.allowCredentials).toBeUndefined();
    const r = await s.passkey.authentication.verify({ response: s.auth.get(opts) });
    expect(r.verified && r.userId).toBe('alice');
  });

  it('rejects invalid signature', async () => {
    const s = setup();
    await register(s);
    const opts = await s.passkey.authentication.generateOptions();
    expect(code(await s.passkey.authentication.verify({ response: s.auth.get(opts, { tamper: true }) }))).toBe('VERIFICATION_FAILED');
  });

  it('rejects wrong origin', async () => {
    const s = setup();
    await register(s);
    const opts = await s.passkey.authentication.generateOptions();
    expect(code(await s.passkey.authentication.verify({ response: s.auth.get(opts, { origin: 'https://evil.com' }) }))).toBe('VERIFICATION_FAILED');
  });

  it('rejects unknown credential', async () => {
    const s = setup();
    const stranger = new VirtualAuthenticator({ origin: ORIGIN });
    stranger.create(await setup().passkey.registration.generateOptions({ userId: 'x', username: 'x' }));
    const opts = await s.passkey.authentication.generateOptions();
    expect(code(await s.passkey.authentication.verify({ response: stranger.get(opts) }))).toBe('CREDENTIAL_NOT_FOUND');
  });

  it("rejects another user's credential against a user-bound challenge", async () => {
    const s = setup();
    await register(s, 'alice');
    const bob = new VirtualAuthenticator({ origin: ORIGIN });
    await register(s, 'bob', bob);
    const opts = await s.passkey.authentication.generateOptions({ userId: 'alice' });
    const r = await s.passkey.authentication.verify({ response: bob.get({ ...opts, allowCredentials: undefined }) });
    expect(code(r)).toBe('CREDENTIAL_OWNER_MISMATCH');
  });

  it('rejects a mismatched userHandle', async () => {
    const s = setup();
    await register(s, 'alice');
    const opts = await s.passkey.authentication.generateOptions();
    const resp = s.auth.get(opts);
    resp.response.userHandle = Buffer.from('bob').toString('base64url');
    expect(code(await s.passkey.authentication.verify({ response: resp }))).toBe('CREDENTIAL_OWNER_MISMATCH');
  });

  it('rejects replayed assertion', async () => {
    const s = setup();
    await register(s);
    const resp = s.auth.get(await s.passkey.authentication.generateOptions());
    expect(code(await s.passkey.authentication.verify({ response: resp }))).toBe('OK');
    expect(code(await s.passkey.authentication.verify({ response: resp }))).toBe('CHALLENGE_NOT_FOUND');
  });

  it('rejects counter regression (cloned authenticator)', async () => {
    const s = setup();
    const cred = await register(s);
    await s.credentials.update(cred.id, { counter: 100 });
    const r = await s.passkey.authentication.verify({ response: s.auth.get(await s.passkey.authentication.generateOptions()) });
    expect(code(r)).toBe('VERIFICATION_FAILED');
  });

  it('accepts authenticators that always report counter 0', async () => {
    const s = setup();
    const zero = new VirtualAuthenticator({ origin: ORIGIN, counterStep: 0 });
    await register(s, 'u', zero);
    for (let i = 0; i < 2; i++) {
      const r = await s.passkey.authentication.verify({ response: zero.get(await s.passkey.authentication.generateOptions()) });
      expect(code(r)).toBe('OK');
    }
  });

  it('expired challenge fails', async () => {
    const s = setup({ timeoutMs: 1000 });
    await register(s);
    const opts = await s.passkey.authentication.generateOptions();
    s.clock.t += 1001;
    expect(code(await s.passkey.authentication.verify({ response: s.auth.get(opts) }))).toBe('CHALLENGE_EXPIRED');
  });

  it('only one of many concurrent verifications succeeds', async () => {
    const s = setup();
    await register(s);
    const resp = s.auth.get(await s.passkey.authentication.generateOptions());
    const results = await Promise.all(Array.from({ length: 10 }, () => s.passkey.authentication.verify({ response: resp })));
    expect(results.filter((r) => r.verified)).toHaveLength(1);
  });

  it('a deleted credential can no longer log in', async () => {
    const s = setup();
    const cred = await register(s);
    await expect(s.passkey.credentials.delete('someone-else', cred.id)).rejects.toThrow(PasskeyError);
    await s.passkey.credentials.delete('user-1', cred.id);
    const r = await s.passkey.authentication.verify({ response: s.auth.get(await s.passkey.authentication.generateOptions()) });
    expect(code(r)).toBe('CREDENTIAL_NOT_FOUND');
  });

  it('error messages contain no challenge material', async () => {
    const s = setup();
    await register(s);
    const opts = await s.passkey.authentication.generateOptions();
    s.clock.t += 10 * 60_000;
    const r = await s.passkey.authentication.verify({ response: s.auth.get(opts) });
    expect(r.verified).toBe(false);
    if (!r.verified) expect(r.error.message).not.toContain(opts.challenge);
  });
});

describe('credential manager', () => {
  it('renames only owned credentials', async () => {
    const s = setup();
    const cred = await register(s);
    await s.passkey.credentials.rename('user-1', cred.id, 'Laptop');
    expect((await s.credentials.findById(cred.id))!.name).toBe('Laptop');
    await expect(s.passkey.credentials.rename('other', cred.id, 'x')).rejects.toMatchObject({ code: 'CREDENTIAL_NOT_FOUND' });
  });
});
