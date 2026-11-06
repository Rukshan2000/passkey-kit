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
| 0.1.x | ✅ |

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
| **Misconfiguration.** | Configuration is checked at startup: origins must be HTTPS (except localhost), have no path, and be within `rpID`. There is no wildcard origin. |

### Out of scope

passkey-kit is one part of your authentication. These are the application's responsibility:

- **Sessions:** creating, regenerating and expiring session cookies or tokens after sign-in.
- **Transport security:** serving everything over HTTPS.
- **Rate limiting and abuse protection** on the passkey endpoints.
- **Account recovery** when a user loses every passkey. Recovery is often the weakest link, so design it carefully.
- **Compromised user devices or browsers,** and malicious browser extensions.
- **The security of your database** and of the infrastructure running your server.
- **Vulnerabilities in dependencies** such as `@simplewebauthn/server`. These are tracked with Dependabot and `npm audit` in CI. Report upstream issues to the upstream project.

## Security checklist for deployments

- [ ] `origin` lists only your real production origins, all HTTPS
- [ ] `rpID` is your registrable domain (it can't be changed later without users re-registering)
- [ ] A shared database is used for challenges (not `@passkey-kit/memory`)
- [ ] The session is regenerated on sign-in, and cookies are `HttpOnly`, `Secure` and `SameSite`
- [ ] The `/login/*` and `/register/*` routes are rate-limited
- [ ] Request bodies of passkey routes aren't logged
- [ ] `userVerification: 'required'` is set if you need proof the user unlocked their device
- [ ] There is an account recovery process
- [ ] Dependencies are kept up to date
