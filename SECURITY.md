# Security Policy

## Reporting a vulnerability

**Please don't open a public issue for security problems.**

Report privately through [GitHub Security Advisories](https://github.com/Rukshan2000/passkey-kit/security/advisories/new). Include:

- the affected package and version
- what an attacker can do, and how (steps or a proof of concept)
- any fix you suggest

You'll get a reply within 7 days. Once a fix is released, the advisory is published with credit to you, unless you'd rather stay anonymous.

## Supported versions

| Version | Supported |
| --- | --- |
| 0.2.x | ✅ |
| 0.1.x | ❌ Upgrade to 0.2 |

Before 1.0, only the latest minor version receives security fixes.

## Threat model

### What passkey-kit protects

| Threat | Protection |
| --- | --- |
| **Phishing.** A fake site tries to collect a passkey sign-in. | The origin and RP ID in every response must exactly match the configured values. Browsers also refuse to use a passkey on the wrong domain. |
| **Replay.** A captured sign-in response is sent again. | Each challenge is random (32 bytes), expires, and is deleted atomically on first use, before verification. |
| **Concurrent reuse.** The same response is sent many times at once. | `ChallengeStore.consume` must be an atomic get-and-delete, so at most one request can obtain the challenge. Tested for every adapter. |
| **Cross-account use.** An attacker answers someone else's challenge with their own passkey, or claims another user ID. | Challenges are tied to a user and a ceremony type. The signed-in user is taken from the stored credential, never from the client, and the returned user handle must match it. |
| **Cloned authenticators.** | If a signature counter goes backwards, sign-in is rejected. |
| **Database leak.** | Only public keys and metadata are stored, never private keys or biometric data. Leaked rows can't be used to sign in. |
| **Information leaks through errors and logs.** | Error messages contain no challenges, keys or responses. HTTP integrations return only an error code. Unknown usernames get usernameless options, so accounts can't be enumerated. |
| **Misconfiguration.** | Configuration is checked at startup: origins must be HTTPS (except localhost), have no path, and be within `rpID`. Origins on other domains are allowed only when listed explicitly in `relatedOrigins`. There is no wildcard origin. |
| **Session hijacking before a sensitive action.** Someone uses an unattended signed-in browser. | Step-up re-authentication: `requireRecentAuth` rejects sensitive requests unless a passkey was verified recently, and `/reauth/verify` only accepts a passkey owned by the signed-in user. |
| **Cross-tenant sign-in.** A passkey made for one customer domain is used on another. | Each tenant has its own `rpID`, and the authenticator signs a hash of the `rpID`, so the signature can't verify for another tenant. Unknown hosts are rejected. |
| **Forged authenticator models.** Someone claims to use an allowed security key. | With `allowedAuthenticators`, the model ID is trusted only when the authenticator sent a certificate chain that ends at a trusted root. "None" and self attestation are rejected. So are chains SimpleWebAuthn would accept without a root, because it skips the chain check when it has no root for a format. |
| **Brute force and request floods.** | The `rateLimit` hook can reject any passkey route with 429 before any work is done. You supply the limiter. |

### Signal API

Signal API payloads contain only the `rpID`, credential IDs and the user handle. An `unknownCredential` signal is sent only when sign-in fails with `CREDENTIAL_NOT_FOUND`, which the error code already reveals. An `allAcceptedCredentials` signal is sent only to the signed-in owner, after they delete a passkey. Browsers treat signals as hints. They don't affect what the server accepts: a deleted passkey is rejected by the server whether or not the browser acted on the signal.

### Out of scope

passkey-kit is one part of your authentication. These are the application's responsibility:

- **Sessions:** creating, regenerating and expiring session cookies or tokens after sign-in.
- **Transport security:** serving everything over HTTPS.
- **Rate limiting and abuse protection** on the passkey endpoints. passkey-kit provides the `rateLimit` hook, but you provide the limiter and its limits.
- **Trusting the `Host` header** in multi-tenant setups. Only use a host value your own proxy sets.
- **Unique user IDs across tenants** when tenants share a database.
- **Lifecycle hooks.** Hooks are awaited and their errors propagate, so a failing hook can block sign-in. The `credentialId` given to `onLoginFailed` is client-supplied and unverified.
- **Keeping attestation trust current.** If you use `allowedAuthenticators`, initialize `MetadataService` and keep it up to date, or manage your own root certificates.
- **Account recovery** when a user loses every passkey. Recovery is often the weakest link, so design it carefully.
- **Compromised user devices or browsers,** and malicious browser extensions.
- **The security of your database** and of the infrastructure running your server.
- **Vulnerabilities in dependencies** such as `@simplewebauthn/server`. These are tracked with Dependabot and `npm audit` in CI. Report upstream issues to the upstream project.

## Security checklist for deployments

- [ ] `origin` lists only your real production origins, all HTTPS
- [ ] `rpID` is your registrable domain (it can't be changed later without users re-registering)
- [ ] A shared database is used for challenges (not `@passkey-kit/memory`)
- [ ] The session is regenerated on sign-in, and cookies are `HttpOnly`, `Secure` and `SameSite`
- [ ] The `/login/*`, `/register/*` and `/reauth/*` routes are rate-limited
- [ ] Sensitive actions (changing email, payments, deleting the account) use `requireRecentAuth`
- [ ] `relatedOrigins` lists only domains you control, and `/.well-known/webauthn` is served from the `rpID` domain
- [ ] Multi-tenant: hosts come from your proxy, unknown hosts are rejected, and user IDs are unique across tenants
- [ ] If `allowedAuthenticators` is used: `MetadataService` is initialized at startup, or root certificates are set
- [ ] Hooks that must never block sign-in catch their own errors
- [ ] Request bodies of passkey routes aren't logged
- [ ] `userVerification: 'required'` is set if you need proof the user unlocked their device
- [ ] There is an account recovery process
- [ ] Dependencies are kept up to date
