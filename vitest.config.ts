import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const p = (s: string) => fileURLToPath(new URL(s, import.meta.url));
const pkgs = ['core', 'browser', 'express', 'fastify'];
const adapters = ['memory', 'postgres', 'mysql', 'mongodb'];

export default defineConfig({
  resolve: {
    alias: Object.fromEntries([
      ...pkgs.map((n) => [`@passkey-kit/${n}`, p(`./packages/${n}/src/index.ts`)]),
      ...adapters.map((n) => [`@passkey-kit/${n}`, p(`./packages/adapters/${n}/src/index.ts`)]),
    ]),
  },
  test: { include: ['tests/**/*.test.ts'] },
});
