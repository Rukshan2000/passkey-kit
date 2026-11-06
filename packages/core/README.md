# @passkey-kit/core

Passkey (WebAuthn / FIDO2) authentication for Node.js. Works with any framework and any database.

[![npm](https://img.shields.io/npm/v/@passkey-kit/core)](https://www.npmjs.com/package/@passkey-kit/core)

## Install

```sh
npm install @passkey-kit/core
```

## Usage

```ts
import { Passkey } from '@passkey-kit/core';
import { PostgresChallengeStore, PostgresCredentialStore } from '@passkey-kit/postgres';

const credentials = new PostgresCredentialStore(pool);
const challenges = new PostgresChallengeStore(pool);
const passkey = new Passkey({
  rpName: 'My App',
  rpID: 'example.com',
  origin: 'https://example.com',
  credentials,
  challenges,
});

// Add a passkey to a signed-in user
const regOptions = await passkey.registration.generateOptions({ userId: user.id, username: user.email });
const reg = await passkey.registration.verify({ userId: user.id, response: registrationResponse });

// Sign in (usernameless)
const loginOptions = await passkey.authentication.generateOptions();
const login = await passkey.authentication.verify({ response: authenticationResponse });
if (login.verified) createSession(login.userId);
```

- Registration and sign-in, username-first or usernameless
- Several passkeys per user: list, rename, revoke
- One-time challenges that expire and are tied to a user and a ceremony
- Ownership checks, replay protection and cloned-authenticator detection
- `createHandlers()` for wiring into any HTTP framework
- Cryptography by [`@simplewebauthn/server`](https://simplewebauthn.dev)

Pair it with a storage adapter (`@passkey-kit/postgres`, `@passkey-kit/mysql`, `@passkey-kit/mongodb`), a framework integration (`@passkey-kit/express`, `@passkey-kit/fastify`) and `@passkey-kit/browser` on the frontend.

## Documentation

Full guide, security notes and API reference: **[passkey-kit README](https://github.com/Rukshan2000/passkey-kit#readme)**.

## License

MIT
