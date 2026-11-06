import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasskeyClient, PasskeyUnsupportedError } from '@passkey-kit/browser';

afterEach(() => vi.unstubAllGlobals());

describe('PasskeyClient', () => {
  it('reports no support and throws a clear error without WebAuthn', async () => {
    vi.stubGlobal('window', {});
    const c = new PasskeyClient();
    expect(await c.capabilities()).toEqual({ webauthn: false, platformAuthenticator: false, conditionalMediation: false });
    await expect(c.register({} as never)).rejects.toThrow(PasskeyUnsupportedError);
  });

  it('passes decoded options to navigator.credentials.create and serializes the result', async () => {
    const buf = (s: string) => new TextEncoder().encode(s).buffer;
    const create = vi.fn(async () => ({
      id: 'Y3JlZA',
      rawId: buf('cred'),
      type: 'public-key',
      authenticatorAttachment: 'platform',
      getClientExtensionResults: () => ({}),
      response: {
        clientDataJSON: buf('cdj'),
        attestationObject: buf('att'),
        getTransports: () => ['internal'],
        getPublicKeyAlgorithm: () => -7,
        getPublicKey: () => null,
        getAuthenticatorData: () => buf('ad'),
      },
    }));
    class PKC {}
    vi.stubGlobal('PublicKeyCredential', PKC);
    vi.stubGlobal('window', { PublicKeyCredential: PKC, location: { hostname: 'example.com' } });
    vi.stubGlobal('navigator', { credentials: { create } });

    const res = await new PasskeyClient().register({
      rp: { name: 'x', id: 'example.com' },
      user: { id: 'dXNlcg', name: 'u', displayName: 'u' },
      challenge: 'Y2hhbGxlbmdl',
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    });
    const arg = (create.mock.calls[0] as unknown as [{ publicKey: { challenge: ArrayBuffer } }])[0];
    expect(new TextDecoder().decode(arg.publicKey.challenge)).toBe('challenge');
    expect(res.rawId).toBe('Y3JlZA');
    expect(res.response.clientDataJSON).toBe(Buffer.from('cdj').toString('base64url'));
  });

  it('rejects immediately on an already-aborted signal', async () => {
    class PKC {}
    vi.stubGlobal('PublicKeyCredential', PKC);
    vi.stubGlobal('window', { PublicKeyCredential: PKC });
    const ac = new AbortController();
    ac.abort();
    await expect(new PasskeyClient().authenticate({ challenge: 'x' }, { signal: ac.signal })).rejects.toThrow();
  });
});
