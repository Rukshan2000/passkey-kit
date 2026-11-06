# passkey-kit Roadmap

Task list for upcoming work. Tick items off as they land.

## Done (v0.1.0)

- [x] Core: registration, authentication (username-first and usernameless), credential management
- [x] One-time challenges with expiry, bound to a user and a ceremony
- [x] Credential ownership checks, replay protection, signature counter checks
- [x] Browser SDK (capability detection, autofill, AbortSignal)
- [x] Express router and Fastify plugin
- [x] Adapters: memory, PostgreSQL, MySQL, MongoDB, with SQL migrations
- [x] Tests using a real-signature virtual authenticator (46 passing)
- [x] Publish `@passkey-kit/core` to npm

## 1. Finish the first release

- [ ] Publish `@passkey-kit/browser`
- [ ] Publish `@passkey-kit/express`
- [ ] Publish `@passkey-kit/fastify`
- [ ] Publish `@passkey-kit/memory`
- [ ] Publish `@passkey-kit/postgres`
- [ ] Publish `@passkey-kit/mysql`
- [ ] Publish `@passkey-kit/mongodb`
- [x] Main README: overview, quick start, flows, Mermaid diagrams, configuration and API reference
- [x] Better per-package READMEs (these are the npm pages)
- [x] SECURITY.md: threat model and how to report vulnerabilities
- [x] CONTRIBUTING.md
- [x] ESLint and Prettier config
- [x] GitHub Actions: lint, typecheck, tests, build, `npm pack` check
- [x] Run CI against real Postgres, MySQL and MongoDB services
- [x] Test the MySQL adapter against a real server
- [x] Dependabot config
- [ ] Branch protection (CI must pass before merging)

## 2. Developer features

- [x] Friendly passkey names from the AAGUID ("iCloud Keychain", "YubiKey 5", …)
- [x] Signal API support (`sendSignal`) so deleted passkeys are also removed from password managers
- [x] Lifecycle hooks: `onRegistered`, `onLogin`, `onLoginFailed`, `onCredentialDeleted`
- [x] Step-up re-authentication: `requireRecentAuth(maxAgeMs)`
- [x] Redis challenge store (`@passkey-kit/redis`)
- [x] Built-in rate-limiting hooks and documented recipes

## 3. Integrations

- [ ] React hooks package: `usePasskeyRegister()`, `usePasskeyLogin()`, autofill support
- [x] Hono adapter
- [ ] NestJS module
- [x] Next.js helper package (replacing the hand-written example route)
- [ ] Prisma adapter
- [ ] Drizzle adapter

## 4. Advanced

- [x] Multi-tenant support: a different `rpID` and origin per customer domain
- [x] Related origins (one passkey working across several domains)
- [x] Attestation and metadata (MDS) checks to allow only specific authenticators
- [ ] Guide to account recovery when a user loses all their devices
- [ ] Documentation website (e.g. VitePress)
