# @passkey-kit/express

Express router that adds passkey registration, sign-in and passkey management endpoints.

[![npm](https://img.shields.io/npm/v/@passkey-kit/express)](https://www.npmjs.com/package/@passkey-kit/express)

## Install

```sh
npm install @passkey-kit/core @passkey-kit/express
```

## Usage

```ts
import { passkeyRouter } from '@passkey-kit/express';

app.use(
  '/auth/passkey',
  passkeyRouter({
    passkey,
    getUser: (req) => req.session.user ?? null,
    onAuthenticated: (req, result) => {
      req.session.user = { id: result.userId };
      return { verified: true };
    },
  }),
);
```

Routes: `POST /register/options`, `POST /register/verify`, `POST /login/options`, `POST /login/verify`, `GET /credentials`, `DELETE /credentials/:id`.

Sessions are never created for you; do that in `onAuthenticated`. Add rate limiting in front of the routes. Tested with Express 5; Express 4.21+ is supported.

## Documentation

Full guide, security notes and API reference: **[passkey-kit README](https://github.com/Rukshan2000/passkey-kit#readme)**.

## License

MIT
