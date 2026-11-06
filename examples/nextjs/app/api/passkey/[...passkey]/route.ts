import { createPasskeyRoute } from '@passkey-kit/next';
import type { CurrentUser } from '@passkey-kit/core';
import { passkey } from '../../../../lib/passkey';

// Replace with your session library (Auth.js, iron-session, ...).
declare function getSessionUser(req: Request): Promise<CurrentUser | null>;
declare function createSession(userId: string, authenticatedAt: Date): Promise<void>;

export const { GET, POST, DELETE } = createPasskeyRoute({
  passkey,
  getUser: getSessionUser,
  onAuthenticated: async (_req, result) => {
    await createSession(result.userId, result.authenticatedAt);
    return { verified: true };
  },
});
