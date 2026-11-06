# @passkey-kit/hono

Hono routes for passkey registration, sign-in, step-up re-authentication and passkey management.

[![npm](https://img.shields.io/npm/v/@passkey-kit/hono)](https://www.npmjs.com/package/@passkey-kit/hono)

## Install

```sh
npm install @passkey-kit/core @passkey-kit/hono
```

## Usage

```ts
import { Hono } from 'hono';
import { passkeyRoutes, requireRecentAuth } from '@passkey-kit/hono';

const app = new Hono();
app.route(
  '/auth/passkey',
  passkeyRoutes({
    passkey,
    getUser: (c) => c.get('user') ?? null,
    onAuthenticated: async (c, result) => {
      await createSession(c, result.userId);
      return { verified: true };
    },
  }),
);

app.post('/account/email', requireRecentAuth({ maxAgeMs: 300_000, getAuthenticatedAt: (c) => c.get('authenticatedAt') }), changeEmail);
```

Uses only web-standard `Request`/`Response`, so it runs on Node.js, Bun, Deno and Cloudflare Workers. Sessions are never created for you. Requires Hono 4.

## Documentation

Full guide, security notes and API reference: **[passkey-kit README](https://github.com/Rukshan2000/passkey-kit#readme)**.

## License

MIT
