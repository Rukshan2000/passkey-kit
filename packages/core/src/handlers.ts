import { PasskeyError } from './errors.js';
import type { Passkey } from './passkey.js';
import type { AuthenticationResult, StoredCredential } from './types.js';

/** The application's currently signed-in user, if any (from YOUR session system). */
export interface CurrentUser {
  id: string;
  username: string;
  displayName?: string;
}

export interface HandlerOptions<Req> {
  passkey: Passkey;
  /** Return the signed-in user for registration and credential management, or null. */
  getUser(req: Req): CurrentUser | null | Promise<CurrentUser | null>;
  /**
   * Enable username-first login: map a submitted username to a user ID. Return null for
   * unknown users. If omitted, only usernameless login is offered.
   */
  findUserIdByUsername?(username: string): string | null | Promise<string | null>;
  /**
   * Called after a verified login. Create your session here. Its return value is sent
   * as the response body (default: `{ verified: true, userId }`).
   */
  onAuthenticated?(req: Req, result: Extract<AuthenticationResult, { verified: true }>): unknown;
}

export interface HandlerResponse {
  status: number;
  body: unknown;
}

type Input<Req> = { req: Req; body: any; params?: Record<string, string> };

const publicCredential = ({ id, name, deviceType, backedUp, transports, createdAt, lastUsedAt }: StoredCredential) => ({
  id,
  name,
  deviceType,
  backedUp,
  transports,
  createdAt,
  lastUsedAt,
});

const errorBody = (e: PasskeyError) => ({ verified: false, error: e.code });

/**
 * Framework-independent request handlers used by @passkey-kit/express and @passkey-kit/fastify.
 * Each returns `{ status, body }`. Errors expose only a stable `code`.
 */
export function createHandlers<Req>(o: HandlerOptions<Req>) {
  const { passkey } = o;
  const requireUser = async (req: Req) => {
    const u = await o.getUser(req);
    if (!u) throw new HttpError(401, 'UNAUTHENTICATED');
    return u;
  };

  const wrap =
    (fn: (i: Input<Req>) => Promise<HandlerResponse>) =>
    async (i: Input<Req>): Promise<HandlerResponse> => {
      try {
        return await fn({ ...i, body: i.body && typeof i.body === 'object' ? i.body : {} });
      } catch (e) {
        if (e instanceof HttpError) return { status: e.status, body: { error: e.code } };
        if (e instanceof PasskeyError) return { status: e.code === 'CREDENTIAL_NOT_FOUND' ? 404 : 400, body: errorBody(e) };
        throw e;
      }
    };

  return {
    registrationOptions: wrap(async ({ req }) => {
      const u = await requireUser(req);
      return {
        status: 200,
        body: await passkey.registration.generateOptions({ userId: u.id, username: u.username, displayName: u.displayName }),
      };
    }),

    registrationVerify: wrap(async ({ req, body }) => {
      const u = await requireUser(req);
      const r = await passkey.registration.verify({
        userId: u.id,
        response: body.response,
        name: typeof body.name === 'string' ? body.name : undefined,
      });
      return r.verified
        ? { status: 200, body: { verified: true, credential: publicCredential(r.credential) } }
        : { status: 400, body: errorBody(r.error) };
    }),

    authenticationOptions: wrap(async ({ body }) => {
      let userId: string | undefined;
      if (o.findUserIdByUsername && typeof body.username === 'string' && body.username) {
        // Unknown users get usernameless options rather than an error, to avoid account enumeration.
        userId = (await o.findUserIdByUsername(body.username)) ?? undefined;
      }
      return { status: 200, body: await passkey.authentication.generateOptions({ userId }) };
    }),

    authenticationVerify: wrap(async ({ req, body }) => {
      const r = await passkey.authentication.verify({ response: body.response });
      if (!r.verified) return { status: 401, body: errorBody(r.error) };
      const out = o.onAuthenticated ? await o.onAuthenticated(req, r) : undefined;
      return { status: 200, body: out ?? { verified: true, userId: r.userId } };
    }),

    listCredentials: wrap(async ({ req }) => {
      const u = await requireUser(req);
      return { status: 200, body: (await passkey.credentials.list(u.id)).map(publicCredential) };
    }),

    deleteCredential: wrap(async ({ req, params }) => {
      const u = await requireUser(req);
      await passkey.credentials.delete(u.id, params?.id ?? '');
      return { status: 204, body: null };
    }),
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
