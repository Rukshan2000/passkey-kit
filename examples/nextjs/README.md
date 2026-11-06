# Next.js (App Router) example

Drop `lib/passkey.ts` and `app/api/passkey/[action]/route.ts` into a Next.js 15+ app,
then `npm i @passkey-kit/core @passkey-kit/postgres pg`. Run the Postgres migration from
`@passkey-kit/postgres/migrations/001_init.sql`. Replace `getSessionUser` / `createSession`
with your auth library (Auth.js, iron-session, lucia, ...).

The client side uses `@passkey-kit/browser` exactly as in `examples/express/public/index.html`,
posting to `/api/passkey/register-options`, `register-verify`, `login-options`, `login-verify`.
