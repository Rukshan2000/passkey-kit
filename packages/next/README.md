# @passkey-kit/next

Next.js App Router route handlers for passkey registration, sign-in, step-up re-authentication and passkey management.

[![npm](https://img.shields.io/npm/v/@passkey-kit/next)](https://www.npmjs.com/package/@passkey-kit/next)

## Install

```sh
npm install @passkey-kit/core @passkey-kit/next
```

## Usage

```ts
// app/api/passkey/[...passkey]/route.ts
import { createPasskeyRoute } from '@passkey-kit/next';
import { passkey } from '@/lib/passkey';

export const { GET, POST, DELETE } = createPasskeyRoute({
  passkey,
  getUser: async () => (await getSession())?.user ?? null,
  onAuthenticated: async (_req, result) => {
    await createSession(result.userId);
    return { verified: true };
  },
});
```

Routes: `POST /api/passkey/register/options`, `register/verify`, `login/options`, `login/verify`, `reauth/options`, `reauth/verify`; `GET /api/passkey/credentials`; `DELETE /api/passkey/credentials/:id`. Use with any session library (Auth.js, iron-session, …).

## Documentation

Full guide, security notes and API reference: **[passkey-kit README](https://github.com/Rukshan2000/passkey-kit#readme)**.

## License

MIT
