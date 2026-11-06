# @passkey-kit/postgres

PostgreSQL storage for `@passkey-kit/core`.

[![npm](https://img.shields.io/npm/v/@passkey-kit/postgres)](https://www.npmjs.com/package/@passkey-kit/postgres)

## Install

```sh
npm install @passkey-kit/postgres pg
```

## Usage

```sh
psql "$DATABASE_URL" -f node_modules/@passkey-kit/postgres/migrations/001_init.sql
```

```ts
import { Pool } from 'pg';
import { PostgresChallengeStore, PostgresCredentialStore } from '@passkey-kit/postgres';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const credentials = new PostgresCredentialStore(pool);
const challenges = new PostgresChallengeStore(pool);
```

Works with a `pg` `Pool`, `Client` or `PoolClient`. Challenges are consumed with one atomic `DELETE … RETURNING`, so each can be used only once, even across many server instances.

## Documentation

Full guide, security notes and API reference: **[passkey-kit README](https://github.com/Rukshan2000/passkey-kit#readme)**.

## License

MIT
