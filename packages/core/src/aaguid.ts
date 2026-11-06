import { AAGUID_NAMES } from './aaguids.js';

/**
 * Friendly authenticator name for an AAGUID, e.g. "Google Password Manager" or "1Password".
 * Returns undefined for unknown or all-zero AAGUIDs (many security keys send zeros).
 */
export function getAuthenticatorName(aaguid: string | undefined): string | undefined {
  return aaguid ? AAGUID_NAMES[aaguid.toLowerCase()] : undefined;
}
