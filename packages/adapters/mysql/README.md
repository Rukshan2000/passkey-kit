# @passkey-kit/mysql

MySQL 8+ storage for `@passkey-kit/core`.

[![npm](https://img.shields.io/npm/v/@passkey-kit/mysql)](https://www.npmjs.com/package/@passkey-kit/mysql)

## Install

```sh
npm install @passkey-kit/mysql mysql2
```

## Usage

```sh
mysql "$DB" < node_modules/@passkey-kit/mysql/migrations/001_init.sql
mysql "$DB" < node_modules/@passkey-kit/mysql/migrations/002_full_credential_id.sql
```

```ts
import mysql from 'mysql2/promise';
import { MysqlChallengeStore, MysqlCredentialStore } from '@passkey-kit/mysql';

const pool = mysql.createPool(process.env.MYSQL_URL);
const credentials = new MysqlCredentialStore(pool);
const challenges = new MysqlChallengeStore(pool);
```

Challenges are consumed in a transaction with `SELECT … FOR UPDATE`, so each can be used only once, even across many server instances. Requires InnoDB.

## Documentation

Full guide, security notes and API reference: **[passkey-kit README](https://github.com/Rukshan2000/passkey-kit#readme)**.

## License

MIT
