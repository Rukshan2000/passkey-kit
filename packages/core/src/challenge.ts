import { PasskeyError } from './errors.js';
import type { Ceremony, ChallengeRecord, ChallengeStore } from './types.js';

/**
 * Read the challenge echoed in clientDataJSON. This value is untrusted until the
 * signature is verified; we only use it as a lookup key.
 */
export function challengeFromResponse(clientDataJSON: string): string {
  try {
    const data = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')) as { challenge?: unknown };
    if (typeof data.challenge === 'string' && data.challenge.length > 0 && data.challenge.length <= 512) return data.challenge;
  } catch {
    /* fall through */
  }
  throw new PasskeyError('INVALID_INPUT', 'Malformed clientDataJSON');
}

/**
 * Atomically consume a challenge and check it is unexpired and bound to the expected
 * ceremony (and user, when given). Consumption happens before verification so a
 * challenge can never be used twice, even by concurrent or failing requests.
 */
export async function consumeChallenge(
  store: ChallengeStore,
  challenge: string,
  ceremony: Ceremony,
  now: number,
  userId?: string,
): Promise<ChallengeRecord> {
  const record = await store.consume(challenge);
  if (!record) throw new PasskeyError('CHALLENGE_NOT_FOUND', 'Unknown or already used challenge');
  if (record.expiresAt <= now) throw new PasskeyError('CHALLENGE_EXPIRED', 'Challenge expired');
  if (record.ceremony !== ceremony) throw new PasskeyError('CHALLENGE_MISMATCH', 'Challenge issued for a different ceremony');
  if (userId !== undefined && record.userId !== undefined && record.userId !== userId)
    throw new PasskeyError('CHALLENGE_MISMATCH', 'Challenge issued for a different user');
  return record;
}
