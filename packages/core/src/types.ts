import type {
  AuthenticationResponseJSON,
  AuthenticatorTransport,
  CredentialDeviceType,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

export type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
};

export type Ceremony = 'registration' | 'authentication';
export type UserVerification = 'required' | 'preferred' | 'discouraged';

/** A verified passkey as persisted by a {@link CredentialStore}. Contains only public data. */
export interface StoredCredential {
  /** Base64URL credential ID (unique). */
  id: string;
  /** Your application's user ID that owns this credential. */
  userId: string;
  /** COSE-encoded public key. */
  publicKey: Uint8Array<ArrayBuffer>;
  /** Signature counter last seen from the authenticator. */
  counter: number;
  transports?: AuthenticatorTransport[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  /** Authenticator model identifier (not unique per device). */
  aaguid: string;
  /** Optional user-facing label, e.g. "MacBook". */
  name?: string;
  createdAt: Date;
  lastUsedAt?: Date;
}

/** Mutable fields after an authentication. */
export type CredentialUpdate = Partial<Pick<StoredCredential, 'counter' | 'backedUp' | 'lastUsedAt' | 'name'>>;

/** Persistence for credentials. Implement this for any database. */
export interface CredentialStore {
  /** Must reject if a credential with the same `id` already exists. */
  create(credential: StoredCredential): Promise<void>;
  findById(id: string): Promise<StoredCredential | null>;
  listByUser(userId: string): Promise<StoredCredential[]>;
  update(id: string, update: CredentialUpdate): Promise<void>;
  /** Delete a credential only if it belongs to `userId`. Returns whether one was deleted. */
  delete(id: string, userId: string): Promise<boolean>;
}

/** A pending ceremony challenge. The challenge itself is the lookup key. */
export interface ChallengeRecord {
  challenge: string;
  ceremony: Ceremony;
  /** Bound user; absent for usernameless authentication. */
  userId?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/** Temporary challenge storage. `consume` MUST be atomic (get-and-delete). */
export interface ChallengeStore {
  save(record: ChallengeRecord): Promise<void>;
  /** Atomically fetch and remove. Concurrent calls for the same challenge must yield it at most once. */
  consume(challenge: string): Promise<ChallengeRecord | null>;
  /** Remove expired records. Called opportunistically; stores may also rely on TTL indexes. */
  deleteExpired(now: number): Promise<void>;
}

export interface PasskeyConfig {
  /** Human-readable relying party name shown by authenticators. */
  rpName: string;
  /** Effective domain, e.g. "example.com". No scheme or port. */
  rpID: string;
  /** Exact allowed origin(s), e.g. "https://example.com". */
  origin: string | string[];
  credentials: CredentialStore;
  challenges: ChallengeStore;
  /** Default: "preferred". "required" also enforces UV during verification. */
  userVerification?: UserVerification;
  /** Default: "required" (discoverable passkeys). */
  residentKey?: 'required' | 'preferred' | 'discouraged';
  /** Default: "none". */
  attestationType?: 'none' | 'direct' | 'enterprise';
  authenticatorAttachment?: 'platform' | 'cross-platform';
  /** Challenge lifetime and ceremony timeout in ms. Default 5 minutes. */
  timeoutMs?: number;
  /** Current time source (tests). */
  now?: () => number;
}

export interface RegistrationOptionsInput {
  userId: string;
  username: string;
  displayName?: string;
}

export interface RegistrationVerifyInput {
  userId: string;
  response: RegistrationResponseJSON;
  /** Optional label to store with the credential. */
  name?: string;
}

export interface AuthenticationOptionsInput {
  /** Omit for usernameless (discoverable) login. */
  userId?: string;
}

export interface AuthenticationVerifyInput {
  response: AuthenticationResponseJSON;
  /** If given, the credential must belong to this user. */
  userId?: string;
}

export type VerifyResult<T> = ({ verified: true } & T) | { verified: false; error: import('./errors.js').PasskeyError };

export type RegistrationResult = VerifyResult<{ credential: StoredCredential }>;
export type AuthenticationResult = VerifyResult<{ userId: string; credential: StoredCredential; userVerified: boolean }>;
