import { getAuthenticatorName } from './aaguid.js';
import { PasskeyError } from './errors.js';
import type { Passkey } from './passkey.js';
import type { AuthenticationResult, StoredCredential } from './types.js';

/** The application's currently signed-in user, if any (from YOUR session system). */
export interface CurrentUser {
  id: string;
  username: string;
  displayName?: string;
}

/** Names of the routes, as passed to `rateLimit`. */
export type HandlerAction =
  | 'registrationOptions'
  | 'registrationVerify'
  | 'authenticationOptions'
  | 'authenticationVerify'
  | 'reauthOptions'
  | 'reauthVerify'
  | 'listCredentials'
  | 'deleteCredential'
  | 'wellKnown';

type VerifiedLogin = Extract<AuthenticationResult, { verified: true }>;

export interface HandlerOptions<Req> {
  /** A `Passkey` instance, or a function picking one per request (multi-tenant apps). */
  passkey: Passkey | ((req: Req) => Passkey | null | Promise<Passkey | null>);
  /** Return the signed-in user for registration and credential management, or null. */
  getUser(req: Req): CurrentUser | null | Promise<CurrentUser | null>;
  /**
   * Enable username-first login: map a submitted username to a user ID. Return null for
   * unknown users. If omitted, only usernameless login is offered.
   */
  findUserIdByUsername?(username: string, req: Req): string | null | Promise<string | null>;
  /**
   * Called after a verified login. Create your session here (and store
   * `result.authenticatedAt` for step-up checks). Its return value is sent as the response
   * body (default: `{ verified: true, userId }`).
   */
  onAuthenticated?(req: Req, result: VerifiedLogin): unknown;
  /**
   * Called after a signed-in user re-verifies with a passkey (`/reauth/verify`). Update
   * `authenticatedAt` in the session here. Default body: `{ verified: true, authenticatedAt }`.
   */
  onReauthenticated?(req: Req, result: VerifiedLogin): unknown;
  /** Return false to reject the request with 429 `RATE_LIMITED`. Called before every route. */
  rateLimit?(req: Req, action: HandlerAction): boolean | Promise<boolean>;
}

export interface HandlerResponse {
  status: number;
  body: unknown;
}

export type HandlerInput<Req> = { req: Req; body?: unknown; params?: Record<string, string> };
export type Handler<Req> = (input: HandlerInput<Req>) => Promise<HandlerResponse>;
type Ctx<Req> = { req: Req; body: any; params?: Record<string, string>; passkey: Passkey };

/** What clients see about a credential: never the public key or counter. */
const publicCredential = ({ id, name, aaguid, deviceType, backedUp, transports, createdAt, lastUsedAt }: StoredCredential) => ({
  id,
  name,
  authenticator: getAuthenticatorName(aaguid),
  deviceType,
  backedUp,
  transports,
  createdAt,
  lastUsedAt,
});

const errorBody = (e: PasskeyError) => ({ verified: false, error: e.code });

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/**
 * Framework-independent request handlers used by the Express, Fastify, Hono, NestJS and
 * Next.js integrations. Each returns `{ status, body }` (body `null` means no content).
 * Errors expose only a stable `code`.
 */
export function createHandlers<Req>(o: HandlerOptions<Req>) {
  const getPasskey = async (req: Req) => {
    const p = typeof o.passkey === 'function' ? await o.passkey(req) : o.passkey;
    if (!p) throw new HttpError(404, 'UNKNOWN_TENANT');
    return p;
  };
  const requireUser = async (req: Req) => {
    const u = await o.getUser(req);
    if (!u) throw new HttpError(401, 'UNAUTHENTICATED');
    return u;
  };

  const wrap =
    (action: HandlerAction, fn: (c: Ctx<Req>) => Promise<HandlerResponse>): Handler<Req> =>
    async ({ req, body, params }) => {
      try {
        if (o.rateLimit && !(await o.rateLimit(req, action))) throw new HttpError(429, 'RATE_LIMITED');
        const passkey = await getPasskey(req);
        return await fn({ req, params, passkey, body: body && typeof body === 'object' ? body : {} });
      } catch (e) {
        if (e instanceof HttpError) return { status: e.status, body: { error: e.code } };
        if (e instanceof PasskeyError) return { status: e.code === 'CREDENTIAL_NOT_FOUND' ? 404 : 400, body: errorBody(e) };
        throw e;
      }
    };

  /** Failed login body. For unknown credentials, include a signal so the browser can forget it. */
  const loginFailure = (passkey: Passkey, error: PasskeyError, body: any) => {
    const id = body.response?.id;
    const signal =
      error.code === 'CREDENTIAL_NOT_FOUND' && typeof id === 'string' && id.length <= 1024
        ? passkey.credentials.unknownCredentialSignal(id)
        : undefined;
    return { status: 401, body: signal ? { ...errorBody(error), signal } : errorBody(error) };
  };

  const handlers = {
    registrationOptions: wrap('registrationOptions', async ({ req, passkey }) => {
      const u = await requireUser(req);
      return {
        status: 200,
        body: await passkey.registration.generateOptions({ userId: u.id, username: u.username, displayName: u.displayName }),
      };
    }),

    registrationVerify: wrap('registrationVerify', async ({ req, body, passkey }) => {
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

    authenticationOptions: wrap('authenticationOptions', async ({ req, body, passkey }) => {
      let userId: string | undefined;
      if (o.findUserIdByUsername && typeof body.username === 'string' && body.username) {
        // Unknown users get usernameless options rather than an error, to avoid account enumeration.
        userId = (await o.findUserIdByUsername(body.username, req)) ?? undefined;
      }
      return { status: 200, body: await passkey.authentication.generateOptions({ userId }) };
    }),

    authenticationVerify: wrap('authenticationVerify', async ({ req, body, passkey }) => {
      const r = await passkey.authentication.verify({ response: body.response });
      if (!r.verified) return loginFailure(passkey, r.error, body);
      const out = o.onAuthenticated ? await o.onAuthenticated(req, r) : undefined;
      return { status: 200, body: out ?? { verified: true, userId: r.userId } };
    }),

    /** Step-up: options limited to the signed-in user's passkeys. */
    reauthOptions: wrap('reauthOptions', async ({ req, passkey }) => {
      const u = await requireUser(req);
      return { status: 200, body: await passkey.authentication.generateOptions({ userId: u.id }) };
    }),

    /** Step-up: the passkey must belong to the signed-in user. */
    reauthVerify: wrap('reauthVerify', async ({ req, body, passkey }) => {
      const u = await requireUser(req);
      const r = await passkey.authentication.verify({ response: body.response, userId: u.id });
      if (!r.verified) return loginFailure(passkey, r.error, body);
      const out = o.onReauthenticated ? await o.onReauthenticated(req, r) : undefined;
      return { status: 200, body: out ?? { verified: true, authenticatedAt: r.authenticatedAt } };
    }),

    listCredentials: wrap('listCredentials', async ({ req, passkey }) => {
      const u = await requireUser(req);
      return { status: 200, body: (await passkey.credentials.list(u.id)).map(publicCredential) };
    }),

    /** Responds with an `allAcceptedCredentials` signal for the browser to pass to `PasskeyClient.signal()`. */
    deleteCredential: wrap('deleteCredential', async ({ req, params, passkey }) => {
      const u = await requireUser(req);
      await passkey.credentials.delete(u.id, params?.id ?? '');
      return { status: 200, body: { deleted: true, signal: await passkey.credentials.acceptedCredentialsSignal(u.id) } };
    }),

    /** `GET /.well-known/webauthn` for related origins. Mount it at the root of your rpID domain. */
    wellKnown: wrap('wellKnown', async ({ passkey }) => {
      const doc = passkey.wellKnownWebauthn();
      return doc ? { status: 200, body: doc } : { status: 404, body: { error: 'NOT_CONFIGURED' } };
    }),
  };

  return {
    ...handlers,
    /**
     * Find the handler for a method and URL path, matching on the path's end, e.g.
     * `/api/passkey/login/verify`. Used by integrations with catch-all routes.
     */
    match(method: string, pathname: string): { handler: Handler<Req>; params?: Record<string, string> } | null {
      const m = method.toUpperCase();
      const path = pathname.replace(/\/+$/, '');
      const ceremony = path.match(/\/(register|login|reauth)\/(options|verify)$/);
      if (m === 'POST' && ceremony) {
        const prefix = { register: 'registration', login: 'authentication', reauth: 'reauth' }[ceremony[1] as 'register'];
        const key = `${prefix}${ceremony[2] === 'options' ? 'Options' : 'Verify'}` as keyof typeof handlers;
        return { handler: handlers[key] };
      }
      if (m === 'GET' && /\/credentials$/.test(path)) return { handler: handlers.listCredentials };
      const del = path.match(/\/credentials\/([^/]+)$/);
      if (m === 'DELETE' && del) return { handler: handlers.deleteCredential, params: { id: decodeURIComponent(del[1]!) } };
      if (m === 'GET' && path.endsWith('/.well-known/webauthn')) return { handler: handlers.wellKnown };
      return null;
    },
  };
}

export type PasskeyHandlers<Req> = ReturnType<typeof createHandlers<Req>>;
