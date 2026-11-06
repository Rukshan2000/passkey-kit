import { SettingsService } from '@simplewebauthn/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Passkey,
  PasskeyError,
  createHandlers,
  createTenantRegistry,
  getAuthenticatorName,
  requireRecentAuth,
  userHandle,
  type PasskeyConfig,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@passkey-kit/core';
import { MemoryChallengeStore, MemoryCredentialStore } from '@passkey-kit/memory';
import { VirtualAuthenticator, makeAttestationCert } from './virtual-authenticator.js';

const ORIGIN = 'https://example.com';
const GOOGLE_PM = 'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4';
const KEY_MODEL = '11111111-2222-3333-4444-555555555555';

const stores = () => ({ credentials: new MemoryCredentialStore(), challenges: new MemoryChallengeStore() });
const make = (extra: Partial<PasskeyConfig> = {}) =>
  new Passkey({ rpName: 'T', rpID: 'example.com', origin: ORIGIN, ...stores(), ...extra });

async function register(passkey: Passkey, auth: VirtualAuthenticator, userId = 'alice', name?: string) {
  const opts = await passkey.registration.generateOptions({ userId, username: userId });
  return passkey.registration.verify({ userId, response: auth.create(opts), name });
}

describe('authenticator names (AAGUID)', () => {
  it('looks up known names, case-insensitively', () => {
    expect(getAuthenticatorName(GOOGLE_PM)).toBe('Google Password Manager');
    expect(getAuthenticatorName(GOOGLE_PM.toUpperCase())).toBe('Google Password Manager');
    expect(getAuthenticatorName('00000000-0000-0000-0000-000000000000')).toBeUndefined();
    expect(getAuthenticatorName(undefined)).toBeUndefined();
  });

  it('names new passkeys after the authenticator unless a name is given', async () => {
    const passkey = make();
    const r = await register(passkey, new VirtualAuthenticator({ origin: ORIGIN, aaguid: GOOGLE_PM }));
    expect(r.verified && r.credential.name).toBe('Google Password Manager');
    const named = await register(passkey, new VirtualAuthenticator({ origin: ORIGIN, aaguid: GOOGLE_PM }), 'alice', 'Work phone');
    expect(named.verified && named.credential.name).toBe('Work phone');
  });
});

describe('lifecycle hooks', () => {
  it('fires onRegistered, onLogin, onLoginFailed and onCredentialDeleted', async () => {
    const hooks = { onRegistered: vi.fn(), onLogin: vi.fn(), onLoginFailed: vi.fn(), onCredentialDeleted: vi.fn() };
    const passkey = make({ hooks });
    const a = new VirtualAuthenticator({ origin: ORIGIN });
    const reg = await register(passkey, a);
    if (!reg.verified) throw reg.error;
    expect(hooks.onRegistered).toHaveBeenCalledWith({ userId: 'alice', credential: reg.credential });

    const resp = a.get(await passkey.authentication.generateOptions());
    const login = await passkey.authentication.verify({ response: resp });
    expect(login.verified && login.authenticatedAt).toBeInstanceOf(Date);
    expect(hooks.onLogin).toHaveBeenCalledWith(expect.objectContaining({ userId: 'alice', userVerified: true }));

    await passkey.authentication.verify({ response: resp }); // replay
    expect(hooks.onLoginFailed).toHaveBeenCalledWith({ error: expect.any(PasskeyError), credentialId: reg.credential.id });
    expect(hooks.onLoginFailed.mock.calls[0]![0].error.code).toBe('CHALLENGE_NOT_FOUND');

    await passkey.credentials.delete('alice', reg.credential.id);
    expect(hooks.onCredentialDeleted).toHaveBeenCalledWith({ userId: 'alice', credentialId: reg.credential.id });
  });

  it('propagates hook errors', async () => {
    const passkey = make({ hooks: { onRegistered: () => Promise.reject(new Error('audit log down')) } });
    await expect(register(passkey, new VirtualAuthenticator({ origin: ORIGIN }))).rejects.toThrow('audit log down');
  });
});

describe('signals', () => {
  it('builds Signal API payloads with the same user handle used at registration', async () => {
    const passkey = make();
    const reg = await register(passkey, new VirtualAuthenticator({ origin: ORIGIN }));
    const opts = await passkey.registration.generateOptions({ userId: 'alice', username: 'alice' });
    expect(userHandle('alice')).toBe(opts.user.id);
    expect(await passkey.credentials.acceptedCredentialsSignal('alice')).toEqual({
      signalName: 'allAcceptedCredentials',
      rpID: 'example.com',
      userID: opts.user.id,
      allAcceptedCredentialIDs: [reg.verified && reg.credential.id],
    });
    expect(passkey.credentials.userDetailsSignal({ id: 'alice', username: 'alice@example.com' })).toMatchObject({
      signalName: 'currentUserDetails',
      userName: 'alice@example.com',
      userDisplayName: 'alice@example.com',
    });
    expect(passkey.credentials.unknownCredentialSignal('xyz')).toEqual({
      signalName: 'unknownCredential',
      rpID: 'example.com',
      credentialID: 'xyz',
    });
  });
});

describe('step-up re-authentication', () => {
  it('requireRecentAuth accepts recent times and rejects old, missing or future ones', () => {
    const now = 1_000_000;
    expect(() => requireRecentAuth(now - 1000, 5000, now)).not.toThrow();
    expect(() => requireRecentAuth(new Date(now - 1000).toISOString(), 5000, now)).not.toThrow();
    for (const bad of [now - 6000, undefined, null, 'garbage', now + 60_000])
      expect(() => requireRecentAuth(bad, 5000, now)).toThrow(expect.objectContaining({ code: 'REAUTH_REQUIRED' }));
  });

  it('reauth routes only accept the signed-in user’s own passkey', async () => {
    const passkey = make();
    const alice = new VirtualAuthenticator({ origin: ORIGIN });
    const bob = new VirtualAuthenticator({ origin: ORIGIN });
    await register(passkey, alice, 'alice');
    await register(passkey, bob, 'bob');
    const onReauthenticated = vi.fn();
    const h = createHandlers<{ user: string | null }>({
      passkey,
      getUser: (req) => (req.user ? { id: req.user, username: req.user } : null),
      onReauthenticated,
    });

    expect((await h.reauthOptions({ req: { user: null } })).status).toBe(401);
    const opts = (await h.reauthOptions({ req: { user: 'alice' } })).body as PublicKeyCredentialRequestOptionsJSON;
    expect(opts.allowCredentials).toHaveLength(1);

    const wrong = await h.reauthVerify({ req: { user: 'alice' }, body: { response: bob.get({ ...opts, allowCredentials: undefined }) } });
    expect(wrong).toMatchObject({ status: 401, body: { error: 'CREDENTIAL_OWNER_MISMATCH' } });

    const opts2 = (await h.reauthOptions({ req: { user: 'alice' } })).body as never;
    const ok = await h.reauthVerify({ req: { user: 'alice' }, body: { response: alice.get(opts2) } });
    expect(ok.status).toBe(200);
    expect((ok.body as { authenticatedAt: Date }).authenticatedAt).toBeInstanceOf(Date);
    expect(onReauthenticated).toHaveBeenCalledOnce();
  });
});

describe('rate limiting hook', () => {
  it('returns 429 when rateLimit returns false, and passes the action name', async () => {
    const rateLimit = vi.fn((_req: unknown, action: string) => action !== 'authenticationOptions');
    const h = createHandlers({ passkey: make(), getUser: () => null, rateLimit });
    expect(await h.authenticationOptions({ req: {} })).toEqual({ status: 429, body: { error: 'RATE_LIMITED' } });
    expect(rateLimit).toHaveBeenCalledWith({}, 'authenticationOptions');
    expect((await h.listCredentials({ req: {} })).status).toBe(401);
  });
});

describe('route matching', () => {
  const h = createHandlers({ passkey: make(), getUser: () => null });
  it.each([
    ['POST', '/api/passkey/register/options', 'registrationOptions'],
    ['POST', '/register/verify/', 'registrationVerify'],
    ['POST', '/x/login/options', 'authenticationOptions'],
    ['POST', '/x/login/verify', 'authenticationVerify'],
    ['POST', '/x/reauth/options', 'reauthOptions'],
    ['POST', '/x/reauth/verify', 'reauthVerify'],
    ['GET', '/x/credentials', 'listCredentials'],
    ['DELETE', '/x/credentials/a%2Fb', 'deleteCredential'],
    ['GET', '/.well-known/webauthn', 'wellKnown'],
  ])('%s %s', (method, path, name) => {
    const m = h.match(method, path);
    expect(m?.handler).toBe(h[name as keyof typeof h]);
    if (name === 'deleteCredential') expect(m?.params).toEqual({ id: 'a/b' });
  });
  it('returns null for unknown routes and wrong methods', () => {
    expect(h.match('GET', '/x/login/verify')).toBeNull();
    expect(h.match('POST', '/x/nope')).toBeNull();
  });
});

describe('multi-tenant', () => {
  const shared = stores();
  const tenants = createTenantRegistry((host) =>
    ['a.com', 'b.com'].includes(host) ? { rpName: host, rpID: host, origin: `https://${host}`, ...shared } : null,
  );

  it('creates one cached Passkey per known host and rejects others', async () => {
    const a = await tenants.forHost('A.com:443');
    expect(a?.rpID).toBe('a.com');
    expect(await tenants.forHost('a.com')).toBe(a);
    expect((await tenants.forHost('b.com'))?.rpID).toBe('b.com');
    expect(await tenants.forHost('evil.com')).toBeNull();
    expect(await tenants.forHost('bad host/..')).toBeNull();
    expect(await tenants.forHost(undefined)).toBeNull();
  });

  it("a tenant's passkey can't sign in to another tenant", async () => {
    const a = (await tenants.forHost('a.com'))!;
    const b = (await tenants.forHost('b.com'))!;
    const auth = new VirtualAuthenticator({ origin: 'https://a.com' });
    expect((await register(a, auth, 'u1')).verified).toBe(true);
    expect((await a.authentication.verify({ response: auth.get(await a.authentication.generateOptions()) })).verified).toBe(true);
    const cross = await b.authentication.verify({ response: auth.get(await b.authentication.generateOptions()) });
    expect(cross.verified).toBe(false);
  });

  it('handlers accept a per-request passkey and 404 unknown tenants', async () => {
    const h = createHandlers<{ host: string }>({ passkey: (req) => tenants.forHost(req.host), getUser: () => null });
    expect((await h.authenticationOptions({ req: { host: 'a.com' } })).body).toMatchObject({ rpId: 'a.com' });
    expect(await h.authenticationOptions({ req: { host: 'evil.com' } })).toEqual({ status: 404, body: { error: 'UNKNOWN_TENANT' } });
  });
});

describe('related origins', () => {
  it('validates configuration', () => {
    expect(() => make({ relatedOrigins: ['https://sub.example.com'] })).toThrow(/within rpID/);
    expect(() => make({ relatedOrigins: ['http://example.co.uk'] })).toThrow(/https/);
    expect(() => make({ origin: 'https://example.co.uk' })).toThrow(/relatedOrigins/);
  });

  it('accepts sign-ins from a related origin and serves /.well-known/webauthn', async () => {
    const passkey = make({ relatedOrigins: ['https://example.co.uk'] });
    expect(passkey.wellKnownWebauthn()).toEqual({ origins: ['https://example.com', 'https://example.co.uk'] });
    expect(make().wellKnownWebauthn()).toBeNull();

    const uk = new VirtualAuthenticator({ origin: 'https://example.co.uk' });
    expect((await register(passkey, uk)).verified).toBe(true);
    expect((await passkey.authentication.verify({ response: uk.get(await passkey.authentication.generateOptions()) })).verified).toBe(true);

    const evil = new VirtualAuthenticator({ origin: 'https://evil.com' });
    expect((await register(passkey, evil)).verified).toBe(false);

    const h = createHandlers({ passkey, getUser: () => null });
    expect(await h.wellKnown({ req: {} })).toMatchObject({ status: 200, body: { origins: expect.any(Array) } });
  });
});

describe('allowed authenticators (attestation)', () => {
  const cert = makeAttestationCert(KEY_MODEL);
  afterEach(() => SettingsService.setRootCertificates({ identifier: 'packed', certificates: [] }));

  const strict = () => {
    const s = stores();
    return { s, passkey: make({ ...s, attestationType: 'direct', allowedAuthenticators: [KEY_MODEL.toUpperCase()] }) };
  };
  const code = (r: { verified: boolean; error?: PasskeyError }) => (r.verified ? 'OK' : r.error!.code);

  it('requires direct attestation in the config', () => {
    expect(() => make({ allowedAuthenticators: [KEY_MODEL] })).toThrow(/attestationType/);
  });

  it('accepts an allowed model with a certificate chain to a trusted root', async () => {
    SettingsService.setRootCertificates({ identifier: 'packed', certificates: [cert.rootPem] });
    const { passkey } = strict();
    const r = await register(passkey, new VirtualAuthenticator({ origin: ORIGIN, aaguid: KEY_MODEL, attestation: cert }));
    expect(code(r)).toBe('OK');
  });

  it('rejects "none", self attestation, unanchored certificates and other models, storing nothing', async () => {
    const { s, passkey } = strict();
    const cases = [
      new VirtualAuthenticator({ origin: ORIGIN, aaguid: KEY_MODEL }), // none
      new VirtualAuthenticator({ origin: ORIGIN, aaguid: KEY_MODEL, attestation: 'self' }),
      new VirtualAuthenticator({ origin: ORIGIN, aaguid: KEY_MODEL, attestation: cert }), // no trusted root configured
    ];
    for (const a of cases) expect(code(await register(passkey, a))).toBe('AUTHENTICATOR_NOT_ALLOWED');

    SettingsService.setRootCertificates({ identifier: 'packed', certificates: [cert.rootPem] });
    const other = makeAttestationCert(GOOGLE_PM);
    SettingsService.setRootCertificates({ identifier: 'packed', certificates: [cert.rootPem, other.rootPem] });
    expect(code(await register(passkey, new VirtualAuthenticator({ origin: ORIGIN, aaguid: GOOGLE_PM, attestation: other })))).toBe(
      'AUTHENTICATOR_NOT_ALLOWED',
    );
    expect(await s.credentials.listByUser('alice')).toHaveLength(0);
  });

  it("rejects a certificate whose root isn't trusted", async () => {
    const stranger = makeAttestationCert(KEY_MODEL);
    SettingsService.setRootCertificates({ identifier: 'packed', certificates: [cert.rootPem] });
    const { passkey } = strict();
    const r = await register(passkey, new VirtualAuthenticator({ origin: ORIGIN, aaguid: KEY_MODEL, attestation: stranger }));
    expect(code(r)).toBe('VERIFICATION_FAILED');
  });
});
