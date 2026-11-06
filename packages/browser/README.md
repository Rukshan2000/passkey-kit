# @passkey-kit/browser

Browser SDK for passkey registration and sign-in, for use with `@passkey-kit/core` on the server.

[![npm](https://img.shields.io/npm/v/@passkey-kit/browser)](https://www.npmjs.com/package/@passkey-kit/browser)

## Install

```sh
npm install @passkey-kit/browser
```

## Usage

```ts
import { PasskeyClient } from '@passkey-kit/browser';

const client = new PasskeyClient();
const { webauthn, platformAuthenticator, conditionalMediation } = await client.capabilities();

const registration = await client.register(optionsFromServer);   // navigator.credentials.create()
const assertion = await client.authenticate(optionsFromServer);  // navigator.credentials.get()

// Passkey autofill: needs <input autocomplete="username webauthn">
const viaAutofill = await client.authenticate(optionsFromServer, { conditional: true });
```

- Handles base64url ↔ `ArrayBuffer` conversion for you
- Capability detection, passkey autofill, `AbortSignal` and `cancel()`
- A clear `PasskeyUnsupportedError` on browsers without WebAuthn

A successful prompt is not a sign-in: always send the result to your server to verify.

## Documentation

Full guide, security notes and API reference: **[passkey-kit README](https://github.com/Rukshan2000/passkey-kit#readme)**.

## License

MIT
