import { NextResponse, type NextRequest } from 'next/server';
import { createHandlers, type CurrentUser } from '@passkey-kit/core';
import { passkey } from '../../../../lib/passkey';

// Replace with your session library.
declare function getSessionUser(req: NextRequest): Promise<CurrentUser | null>;
declare function createSession(userId: string): Promise<void>;

const h = createHandlers<NextRequest>({
  passkey,
  getUser: getSessionUser,
  onAuthenticated: async (_req, result) => {
    await createSession(result.userId);
    return { verified: true };
  },
});

const actions = {
  'register-options': h.registrationOptions,
  'register-verify': h.registrationVerify,
  'login-options': h.authenticationOptions,
  'login-verify': h.authenticationVerify,
} as const;

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const handler = actions[(await ctx.params).action as keyof typeof actions];
  if (!handler) return new NextResponse(null, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const { status, body: out } = await handler({ req, body });
  return NextResponse.json(out, { status, headers: { 'cache-control': 'no-store' } });
}
