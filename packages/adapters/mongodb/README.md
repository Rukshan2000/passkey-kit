# @passkey-kit/mongodb

MongoDB storage for `@passkey-kit/core`.

[![npm](https://img.shields.io/npm/v/@passkey-kit/mongodb)](https://www.npmjs.com/package/@passkey-kit/mongodb)

## Install

```sh
npm install @passkey-kit/mongodb mongodb
```

## Usage

```ts
import { MongoClient } from 'mongodb';
import { MongoChallengeStore, MongoCredentialStore, ensureMongoIndexes } from '@passkey-kit/mongodb';

const db = (await new MongoClient(process.env.MONGODB_URL).connect()).db('app');
await ensureMongoIndexes(db); // once at startup
const credentials = new MongoCredentialStore(db);
const challenges = new MongoChallengeStore(db);
```

Challenges are consumed with `findOneAndDelete` (atomic), and a TTL index removes expired ones. Collection names can be changed through the constructor.

## Documentation

Full guide, security notes and API reference: **[passkey-kit README](https://github.com/Rukshan2000/passkey-kit#readme)**.

## License

MIT
