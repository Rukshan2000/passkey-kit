# @passkey-kit/memory

In-memory storage for `@passkey-kit/core`. **For development and tests only.**

[![npm](https://img.shields.io/npm/v/@passkey-kit/memory)](https://www.npmjs.com/package/@passkey-kit/memory)

## Install

```sh
npm install -D @passkey-kit/memory
```

## Usage

```ts
import { MemoryChallengeStore, MemoryCredentialStore } from '@passkey-kit/memory';

const credentials = new MemoryCredentialStore();
const challenges = new MemoryChallengeStore();
```

> ⚠️ Don't use this in production. Everything is lost when the process restarts, and with more than one server instance a challenge issued by one instance can't be verified by another. Use `@passkey-kit/postgres`, `@passkey-kit/mysql` or `@passkey-kit/mongodb` instead.

## Documentation

Full guide, security notes and API reference: **[passkey-kit README](https://github.com/Rukshan2000/passkey-kit#readme)**.

## License

MIT
