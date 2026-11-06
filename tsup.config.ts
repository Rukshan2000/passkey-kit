import { defineConfig } from 'tsup';

// Shared by every package: `tsup --config <root>/tsup.config.ts`, run from the package dir.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
});
