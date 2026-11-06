export { Passkey } from './passkey.js';
export { PasskeyError, type PasskeyErrorCode } from './errors.js';
export { CredentialManager } from './credential.js';
export type * from './types.js';
export {
  createHandlers,
  type CurrentUser,
  type Handler,
  type HandlerAction,
  type HandlerInput,
  type HandlerOptions,
  type HandlerResponse,
  type PasskeyHandlers,
} from './handlers.js';
export { requireRecentAuth } from './reauth.js';
export { getAuthenticatorName } from './aaguid.js';
export { userHandle } from './credential.js';
export { createTenantRegistry, type TenantRegistry } from './tenants.js';
export { handleFetchRequest } from './fetch.js';
