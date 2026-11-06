# Claude Code Master Prompt: Build a Production-Ready Passkey Authentication npm Package

Act as a Senior Security Engineer, TypeScript Library Architect, and Open-Source Maintainer.

Your task is to design and implement a production-quality, open-source npm package for passwordless authentication using Passkeys (FIDO2 / WebAuthn).

The package should make implementing passkey registration, authentication, and credential management extremely simple for Node.js developers.

## 1. Project Overview

**Proposed package name:** `passkey-kit`

**Description:** A modern, TypeScript-first, framework-independent Passkey Authentication Toolkit for Node.js.

**Main objective:**
Developers should be able to integrate secure passkey authentication into their existing applications with minimal configuration and code.

The package must support:
- Passkey registration.
- Passkey authentication.
- Credential management.
- Challenge lifecycle management.
- Multiple registered devices per user.
- Database-independent storage.
- Framework integrations.
- Browser-side WebAuthn operations.

Do not implement cryptographic primitives yourself. Use the established SimpleWebAuthn ecosystem as the underlying WebAuthn implementation.

## 2. Technology Stack

- TypeScript (strict mode).
- Node.js LTS.
- ESM-first module architecture.
- SimpleWebAuthn for WebAuthn operations.
- Vitest for testing.
- ESLint and Prettier.
- tsup or an equivalent reliable TypeScript build tool.
- npm for package distribution.
- GitHub Actions for CI/CD.

Use maintained, compatible versions of dependencies. Check their current APIs and documentation before implementation. Do not assume old SimpleWebAuthn APIs are still valid.

## 3. Package Architecture

Create a modular monorepo using npm workspaces.

```text
passkey-kit/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── passkey.ts
│   │   │   ├── registration.ts
│   │   │   ├── authentication.ts
│   │   │   ├── challenge.ts
│   │   │   ├── credential.ts
│   │   │   ├── errors.ts
│   │   │   └── types.ts
│   │   └── package.json
│   ├── browser/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── client.ts
│   │   └── package.json
│   ├── express/
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── package.json
│   ├── fastify/
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── package.json
│   └── adapters/
│       ├── memory/
│       ├── postgres/
│       ├── mysql/
│       └── mongodb/
├── examples/
│   ├── express/
│   ├── nextjs/
│   └── vanilla-node/
├── docs/
├── tests/
├── .github/workflows/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── SECURITY.md
└── package.json
```

Keep the core package independent of Express, Fastify and any particular database.

## 4. Core API Design

Design a clean and intuitive public API.

Illustrative API:

```typescript
import { Passkey } from '@passkey-kit/core';

const passkey = new Passkey({
  rpName: 'My Application',
  rpID: 'example.com',
  origin: 'https://example.com',
  userVerification: 'preferred'
});
```

Registration:

```typescript
const options =
  await passkey.registration.generateOptions({
    userId: 'user-123',
    username: 'rukshan@example.com'
  });
```

Verify registration:

```typescript
const result =
  await passkey.registration.verify({
    userId: 'user-123',
    response: credentialResponse
  });

if (result.verified) {
  // Persist the returned credential.
}
```

Authentication:

```typescript
const options =
  await passkey.authentication.generateOptions({
    userId: 'user-123'
  });
```

Verify authentication:

```typescript
const result =
  await passkey.authentication.verify({
    userId: 'user-123',
    response: authenticationResponse
  });

if (result.verified) {
  // Create the application's authenticated session.
}
```

These are API design examples, not permission to bypass WebAuthn verification or credential persistence requirements. Refine the API based on the actual SimpleWebAuthn version and security requirements.

## 5. Registration Flow

Implement the complete WebAuthn registration lifecycle.

1. Application identifies the user.
2. Generate secure registration options.
3. Generate a cryptographically random challenge.
4. Store the challenge temporarily against the user and ceremony.
5. Return options to the browser.
6. Browser invokes `navigator.credentials.create()`.
7. Browser sends the credential response to the backend.
8. Verify the challenge, origin, RP ID, signature and other required registration properties.
9. Extract the credential public key and metadata.
10. Persist the verified credential.
11. Consume the challenge.
12. Return a structured verification result.

Support:
- Resident credentials / discoverable credentials.
- User verification policies.
- Attestation configuration.
- Authenticator selection.
- Multiple credentials per user.

## 6. Authentication Flow

Implement the complete authentication lifecycle.

1. Generate authentication options.
2. Generate a fresh random challenge.
3. Store the challenge temporarily.
4. Return authentication options to the browser.
5. Browser invokes `navigator.credentials.get()`.
6. Browser sends the assertion response.
7. Retrieve the matching credential.
8. Verify the challenge, origin, RP ID, signature and user verification requirements.
9. Validate the credential belongs to the intended account.
10. Atomically consume the challenge.
11. Update the authenticator signature counter according to WebAuthn rules.
12. Return the verified user and credential information.

Support both:
- Username-first authentication.
- Usernameless / discoverable passkey authentication.

Never trust a client-provided user ID without verifying its relationship to the authenticated credential.

## 7. Storage Adapter Architecture

Create a storage interface independent of database technology.

Define interfaces for:

- Credential storage.
- Challenge storage.

Credential storage must support:

- Create credential.
- Find credential by credential ID.
- List credentials by user.
- Update authenticator metadata.
- Delete credential.

Challenge storage must support:

- Store challenge.
- Retrieve challenge.
- Consume challenge atomically.
- Expire old challenges.

Implement:
- In-memory adapter for development and testing.
- PostgreSQL adapter.
- MySQL adapter.
- MongoDB adapter.

Important:
- Do not use in-memory storage as a production default.
- Document its limitations in multi-instance deployments.
- Use database transactions or atomic operations where needed.
- Never store private biometric information.
- Store credential public keys and required authenticator metadata securely.

Provide SQL migration files for PostgreSQL and MySQL.

## 8. Browser SDK

Create a separate browser package.

Provide simple methods:

```typescript
import { PasskeyClient } from '@passkey-kit/browser';

const client = new PasskeyClient();

const credential =
  await client.register(registrationOptions);

const assertion =
  await client.authenticate(authenticationOptions);
```

Use the official WebAuthn browser APIs.

Support:
- `navigator.credentials.create()`
- `navigator.credentials.get()`
- Browser capability detection.
- Conditional mediation where supported.
- AbortSignal.
- Graceful browser compatibility errors.

Correctly serialize and deserialize ArrayBuffer and binary credential fields. Do not manually construct invalid WebAuthn credential objects.

## 9. Framework Integrations

Create optional Express and Fastify integration packages.

Express should provide convenient route helpers or middleware without forcing applications to adopt a specific session framework.

Provide examples for:

- Registration options endpoint.
- Registration verification endpoint.
- Authentication options endpoint.
- Authentication verification endpoint.
- Credential listing endpoint.
- Credential deletion endpoint.

The framework adapters must delegate actual verification to the core package.

Do not create application sessions automatically unless the application explicitly supplies a session integration.

## 10. Security Requirements

Security is the highest priority.

Implement and test:

- Cryptographically secure random challenges.
- Challenge expiration.
- One-time challenge consumption.
- Challenge binding to user and ceremony.
- RP ID validation.
- Origin validation.
- Signature verification.
- User verification policies.
- Credential ownership validation.
- Replay attack protection.
- Credential revocation.
- Secure error handling.
- Request input validation.
- Rate-limiting integration guidance.
- Safe handling of signature counters.
- Protection against concurrent challenge reuse.

Never:
- Store biometric information.
- Store private keys.
- Trust browser-side verification.
- Accept arbitrary origins by default.
- Skip challenge verification.
- Treat a successful browser biometric prompt as proof of backend authentication.
- Log challenges, credential secrets or sensitive authentication responses.

Provide a SECURITY.md file describing the threat model and responsible disclosure process.

## 11. Developer Experience

The package should be easy to understand and integrate.

Provide:

- Full TypeScript declarations.
- Meaningful error classes.
- Predictable return types.
- Configuration validation.
- Useful debugging messages without exposing sensitive data.
- JSDoc for all public APIs.
- Practical code examples.
- Framework-specific guides.
- Database setup documentation.
- Browser compatibility documentation.

Avoid unnecessary abstractions and excessive configuration.

## 12. Testing Requirements

Use Vitest.

Create comprehensive tests for:

- Successful registration.
- Failed registration.
- Successful authentication.
- Invalid signatures.
- Invalid challenges.
- Expired challenges.
- Reused challenges.
- Wrong RP ID.
- Wrong origin.
- Unknown credentials.
- Credential deletion.
- Multiple registered devices.
- Usernameless login.
- Concurrent verification attempts.
- Storage adapter behavior.

Use authentic WebAuthn test fixtures and suitable virtual authenticators where possible.

Do not rely only on mocked verification functions.

## 13. Documentation

Create a professional README.md containing:

1. Project overview.
2. Features.
3. Installation.
4. Quick start.
5. Registration flow.
6. Authentication flow.
7. Browser SDK.
8. Express integration.
9. Fastify integration.
10. Database adapters.
11. Configuration reference.
12. Security considerations.
13. API reference.
14. Examples.
15. Contributing guidelines.

Include architecture diagrams using Mermaid.

Make the documentation understandable for developers who have never implemented WebAuthn before.

## 14. NPM Package Quality

Configure the packages for publication.

Requirements:

- Correct package names and versions.
- ESM exports.
- TypeScript declarations.
- Correct `exports` mappings.
- `files` allowlists.
- README and license inclusion.
- Peer dependencies where appropriate.
- No unnecessary runtime dependencies.
- Reproducible builds.
- Package-level tests.
- npm pack verification.

Use an appropriate semantic versioning strategy.

Do not publish to npm automatically. Prepare the packages for publication and require explicit approval before publishing.

## 15. CI/CD

Create GitHub Actions workflows for:

- Dependency installation.
- Linting.
- Type checking.
- Unit tests.
- Integration tests.
- Build verification.
- npm package validation.

Ensure pull requests cannot merge when security or test checks fail.

## 16. Implementation Instructions

Work in the following order:

**Phase 1:** Inspect the repository and create the project architecture.

**Phase 2:** Research the latest SimpleWebAuthn APIs and relevant WebAuthn specifications.

**Phase 3:** Implement the core TypeScript package.

**Phase 4:** Implement challenge and credential storage interfaces.

**Phase 5:** Implement the browser SDK.

**Phase 6:** Implement database adapters.

**Phase 7:** Implement Express and Fastify integrations.

**Phase 8:** Write comprehensive tests.

**Phase 9:** Create examples and documentation.

**Phase 10:** Build and validate all npm packages.

After each phase:
- Run relevant tests.
- Fix all errors.
- Review security implications.
- Update documentation.
- Report completed work.

Do not generate the entire project as untested placeholder files.

Do not leave TODOs for critical security features.

Do not claim a feature is complete unless its implementation and tests exist.

## 17. Final Deliverables

At completion, provide:

1. Complete monorepo source code.
2. Working core authentication package.
3. Browser SDK.
4. Framework integrations.
5. Database adapters.
6. SQL migrations.
7. Automated tests.
8. Documentation.
9. Working example applications.
10. GitHub Actions workflows.
11. npm publication instructions.
12. Security audit checklist.

## Final Quality Standard

The result must be a real, usable, maintainable open-source developer library, not a demonstration project.

Prioritize security, simplicity, extensibility, TypeScript quality and developer experience.

Start by inspecting the current repository, researching current dependencies, and proposing the implementation plan. Then proceed with implementation phase by phase without stopping after producing only the plan.