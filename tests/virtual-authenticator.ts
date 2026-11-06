/**
 * A software FIDO2 authenticator that produces real, signed WebAuthn responses
 * ("none" attestation, ES256). Lets tests exercise SimpleWebAuthn's actual
 * verification instead of mocking it.
 */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@passkey-kit/core';

const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest();

interface Key {
  id: Buffer;
  privateKey: KeyObject;
  userHandle: string;
  counter: number;
  rpId: string;
}

export class VirtualAuthenticator {
  readonly keys: Key[] = [];
  constructor(
    private readonly opts: { origin: string; userVerified?: boolean; counterStep?: number } = { origin: 'https://example.com' },
  ) {}

  private flags(attested: boolean) {
    // UP=0x01, UV=0x04, BE=0x08, BS=0x10, AT=0x40
    return 0x01 | (this.opts.userVerified === false ? 0 : 0x04) | 0x08 | 0x10 | (attested ? 0x40 : 0);
  }

  private clientData(type: string, challenge: string, origin = this.opts.origin) {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  create(options: PublicKeyCredentialCreationOptionsJSON, overrides: { origin?: string; rpId?: string } = {}): RegistrationResponseJSON {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = publicKey.export({ format: 'jwk' });
    const cose = new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x!, 'base64url')],
      [-3, Buffer.from(jwk.y!, 'base64url')],
    ]);
    const id = randomBytes(16);
    const rpId = overrides.rpId ?? options.rp.id!;
    const counter = this.opts.counterStep === 0 ? 0 : 1;
    const authData = Buffer.concat([
      sha256(rpId),
      Buffer.from([this.flags(true)]),
      u32(counter),
      Buffer.alloc(16),
      Buffer.from([0, id.length]),
      id,
      Buffer.from(isoCBOR.encode(cose)),
    ]);
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]) as never,
    );
    this.keys.push({ id, privateKey, userHandle: options.user.id, counter, rpId });
    return {
      id: b64(id),
      rawId: b64(id),
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64(this.clientData('webauthn.create', options.challenge, overrides.origin)),
        attestationObject: b64(attestationObject),
        transports: ['internal'],
      },
    };
  }

  get(
    options: PublicKeyCredentialRequestOptionsJSON,
    overrides: { origin?: string; key?: Key; tamper?: boolean } = {},
  ): AuthenticationResponseJSON {
    const allowed = options.allowCredentials?.map((c) => c.id);
    const key = overrides.key ?? this.keys.find((k) => !allowed || allowed.includes(b64(k.id)));
    if (!key) throw new Error('No matching credential');
    if (this.opts.counterStep !== 0) key.counter += this.opts.counterStep ?? 1;
    const authData = Buffer.concat([sha256(key.rpId), Buffer.from([this.flags(false)]), u32(key.counter)]);
    const clientDataJSON = this.clientData('webauthn.get', options.challenge, overrides.origin);
    let signature = sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), key.privateKey);
    if (overrides.tamper) signature = Buffer.from(signature.map((b, i) => (i === 10 ? b ^ 0xff : b)));
    return {
      id: b64(key.id),
      rawId: b64(key.id),
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64(clientDataJSON),
        authenticatorData: b64(authData),
        signature: b64(signature),
        userHandle: key.userHandle,
      },
    };
  }
}

function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}
