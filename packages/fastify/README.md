# @passkey-kit/fastify

Fastify plugin that adds passkey registration, sign-in and passkey management endpoints.

[![npm](https://img.shields.io/npm/v/@passkey-kit/fastify)](https://www.npmjs.com/package/@passkey-kit/fastify)

## Install

```sh
npm install @passkey-kit/core @passkey-kit/fastify
```

## Usage

```ts
import { passkeyPlugin } from '@passkey-kit/fastify';

await app.register(passkeyPlugin, {
  prefix: '/auth/passkey',
  passkey,
  getUser: (req) => req.session.get('user') ?? null,
  onAuthenticated: async (req, result) => {
    req.session.set('user', { id: result.userId });
    return { verified: true };
  },
});
```

Same routes as `@passkey-kit/express`. Sessions are never created for you. Requires Fastify 5.

## Documentation

Full guide, security notes and API reference: **[passkey-kit README](https://github.com/Rukshan2000/passkey-kit#readme)**.

## License

MIT
