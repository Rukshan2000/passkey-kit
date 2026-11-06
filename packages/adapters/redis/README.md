# @passkey-kit/redis

Redis challenge store for `@passkey-kit/core`. Works with `redis` (node-redis) and `ioredis`.

[![npm](https://img.shields.io/npm/v/@passkey-kit/redis)](https://www.npmjs.com/package/@passkey-kit/redis)

## Install

```sh
npm install @passkey-kit/redis redis   # or: ioredis
```

## Usage

```ts
import { createClient } from 'redis';
import { RedisChallengeStore } from '@passkey-kit/redis';

const redis = await createClient({ url: process.env.REDIS_URL }).connect();
const challenges = new RedisChallengeStore(redis); // optional 2nd argument: key prefix

// ioredis works too:
// import { Redis } from 'ioredis';
// const challenges = new RedisChallengeStore(new Redis(process.env.REDIS_URL));
```

Requires Redis 6.2+. A challenge is consumed with `GETDEL`, which is atomic, and Redis expires old challenges itself. This package stores **challenges only**; keep credentials in `@passkey-kit/postgres`, `@passkey-kit/mysql` or `@passkey-kit/mongodb`.

## Documentation

Full guide, security notes and API reference: **[passkey-kit README](https://github.com/Rukshan2000/passkey-kit#readme)**.

## License

MIT
