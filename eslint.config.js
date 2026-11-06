import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'examples/nextjs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        crypto: 'readonly',
        URL: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        fetch: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
      },
    },
    rules: {
      // Adapters map untyped DB rows; `any` is contained to those row mappers.
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  { files: ['examples/**', 'scripts/**'], rules: { 'no-console': 'off' } },
);
