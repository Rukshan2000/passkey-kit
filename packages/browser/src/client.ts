import {
  WebAuthnAbortService,
  WebAuthnError,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
  sendSignal,
  type SendSignalAllAcceptedCredentialsOpts,
  type SendSignalCurrentUserDetailsOpts,
  type SendSignalUnknownCredentialOpts,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/browser';

export type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
};
export { WebAuthnError };

/** A Signal API payload produced by `@passkey-kit/core` (e.g. in a delete or failed-login response). */
export type PasskeySignal = SendSignalUnknownCredentialOpts | SendSignalAllAcceptedCredentialsOpts | SendSignalCurrentUserDetailsOpts;

/** Thrown when the browser cannot perform WebAuthn at all. */
export class PasskeyUnsupportedError extends Error {
  override readonly name = 'PasskeyUnsupportedError';
}

export interface Capabilities {
  webauthn: boolean;
  platformAuthenticator: boolean;
  conditionalMediation: boolean;
}

export interface CeremonyOptions {
  /** Abort the browser prompt. */
  signal?: AbortSignal;
}

/**
 * Thin, typed wrapper over `navigator.credentials` (via @simplewebauthn/browser, which
 * handles ArrayBuffer <-> base64url conversion). The returned JSON is what your server's
 * `verify()` expects. A successful prompt is NOT authentication: always verify server-side.
 */
export class PasskeyClient {
  /** Detect what this browser supports. Never throws. */
  async capabilities(): Promise<Capabilities> {
    const webauthn = browserSupportsWebAuthn();
    if (!webauthn) return { webauthn, platformAuthenticator: false, conditionalMediation: false };
    const [platformAuthenticator, conditionalMediation] = await Promise.all([
      platformAuthenticatorIsAvailable().catch(() => false),
      browserSupportsWebAuthnAutofill().catch(() => false),
    ]);
    return { webauthn, platformAuthenticator, conditionalMediation };
  }

  /** Run `navigator.credentials.create()` with server-provided options. */
  async register(options: PublicKeyCredentialCreationOptionsJSON, opts: CeremonyOptions = {}): Promise<RegistrationResponseJSON> {
    this.assertSupported();
    return withSignal(opts.signal, () => startRegistration({ optionsJSON: options }));
  }

  /**
   * Run `navigator.credentials.get()`. Set `conditional: true` to use passkey autofill
   * (requires an `<input autocomplete="username webauthn">` on the page).
   */
  async authenticate(
    options: PublicKeyCredentialRequestOptionsJSON,
    opts: CeremonyOptions & { conditional?: boolean } = {},
  ): Promise<AuthenticationResponseJSON> {
    this.assertSupported();
    return withSignal(opts.signal, () => startAuthentication({ optionsJSON: options, useBrowserAutofill: opts.conditional }));
  }

  /**
   * Tell the browser's password manager about passkey changes (WebAuthn Signal API), so a
   * deleted passkey stops being offered. Signals are hints: returns false, without
   * throwing, when the browser doesn't support them or ignores the request.
   */
  async signal(signal: PasskeySignal | null | undefined): Promise<boolean> {
    if (!signal) return false;
    try {
      await sendSignal(signal);
      return true;
    } catch {
      return false;
    }
  }

  /** Cancel any in-flight ceremony (e.g. pending conditional UI before a modal login). */
  cancel(): void {
    WebAuthnAbortService.cancelCeremony();
  }

  private assertSupported() {
    if (!browserSupportsWebAuthn()) throw new PasskeyUnsupportedError('This browser does not support passkeys (WebAuthn).');
  }
}

async function withSignal<T>(signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
  if (!signal) return run();
  signal.throwIfAborted();
  const onAbort = () => WebAuthnAbortService.cancelCeremony();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    return await run();
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
