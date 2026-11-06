# Changelog

## 0.3.0

### Breaking changes

- **`userVerification` now defaults to `'required'`** (was `'preferred'`). Sign-in needs a PIN or biometric, and responses without user verification are rejected. To accept possession alone (e.g. a tapped security key), set `userVerification: 'preferred'` and check `result.userVerified`.
- **MySQL:** run `migrations/002_full_credential_id.sql`. Credential IDs up to the spec maximum (1364 base64url characters) are now stored in full, and IDs sharing a 255-character prefix no longer collide.
- Node.js 22.12 or later is required.

### Security

- Next.js and Hono (fetch handler): non-empty request bodies must be `application/json` (415 otherwise). This blocks login CSRF through cross-site `text/plain` and form posts.
- Fetch handler: request bodies are capped at 64 KB while streaming (bytes, not characters) instead of being fully buffered first.
- Signature counters never move backwards when concurrent logins finish out of order (all stores). Custom `CredentialStore.update` implementations must store `max(current, counter)`.

### Fixes

- A registration that loses a race against a concurrent insert of the same credential now returns `CREDENTIAL_EXISTS` instead of throwing.
- Credential IDs longer than 1364 characters are rejected at registration.
- Malformed percent-encoding in `DELETE /credentials/:id` returns 404 instead of crashing.
- Fastify plugin now serves `GET /.well-known/webauthn`.
- `TenantRegistry.invalidate()` normalizes the host and port like `forHost()`.
- Packages can be loaded with `require()` (export map gains a `default` condition).

### Docs

- CSRF and SameSite cookie guidance; corrected the username-enumeration claim for username-first sign-in.
