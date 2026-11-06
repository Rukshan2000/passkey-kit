# Contributing to passkey-kit

Thanks for helping! Bug reports, docs fixes and pull requests are all welcome.

For security issues, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## Setup

Requires Node.js 22+.

```sh
git clone https://github.com/Rukshan2000/passkey-kit.git
cd passkey-kit
npm install
npm run build
npm test
```

## Repository layout

```text
packages/core              server logic (no framework or database code)
packages/browser           browser SDK
packages/express           Express router
packages/fastify           Fastify plugin
packages/adapters/*        memory, postgres, mysql, mongodb stores
examples/                  runnable example apps
tests/                     Vitest tests for all packages
tests/virtual-authenticator.ts   a software authenticator that produces real signed responses
```

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Run all tests |
| `npm run lint` | ESLint |
| `npm run format` | Format with Prettier (`format:check` only checks) |
| `npm run typecheck` | TypeScript, no output |
| `npm run build` | Build every package into `dist/` |
| `node scripts/smoke.mjs` | Import every built package the way users do |
| `npm run pack:check` | Dry-run `npm pack` for every package |

## Database tests

Adapter tests for PostgreSQL, MySQL and MongoDB run only when their URLs are set:

```sh
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/postgres \
MYSQL_URL=mysql://root:root@localhost:3306/passkey \
MONGODB_URL=mongodb://localhost:27017 \
npm test
```

They drop and recreate their tables, so **use throwaway databases**. With Docker:

```sh
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=passkey mysql:8.4
docker run -d -p 27017:27017 mongo:7
```

CI runs all three on every pull request.

## Pull requests

1. Open an issue first for anything bigger than a small fix, so we can agree on the approach.
2. Add or update tests. Security behaviour must be tested through the virtual authenticator, not by mocking verification.
3. Make sure `npm run lint && npm run format:check && npm run typecheck && npm test` passes.
4. Update the README if you change public behaviour.
5. Keep pull requests focused on one change.

Guidelines:

- Keep `@passkey-kit/core` free of framework and database code.
- Don't implement cryptography. Use `@simplewebauthn/server`.
- Never log challenges, keys or WebAuthn responses.
- Avoid new runtime dependencies unless there's a strong reason.

## Releasing (maintainers)

Versions follow [semver](https://semver.org). Before 1.0, breaking changes bump the minor version (0.1 → 0.2).

```sh
# 1. Bump the versions of the packages that changed (and the @passkey-kit/core range in dependants if needed)
npm version patch -w @passkey-kit/core --no-git-tag-version

# 2. Verify
npm run lint && npm run typecheck && npm test && npm run build && node scripts/smoke.mjs && npm run pack:check

# 3. Commit and tag
git commit -am "release: core 0.1.1"
git tag core-v0.1.1
git push --follow-tags

# 4. Publish (needs npm 2FA). Publish core before packages that depend on it.
npm publish -w @passkey-kit/core --access public
```

Packages are never published automatically.
