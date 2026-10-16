import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { isInternalRequestAuthorized, MAX_INTERNAL_JSON_BODY_CHARS } from '@/lib/internal-auth';

export const runtime = 'nodejs';

const SECRET_ENV = 'INTERNAL_PASSWORD_RESET_SECRET';
const MAX_EMAIL_LENGTH = 254;

/**
 * Trusted internal endpoint -- called only by the storefront's requestPasswordReset/resetPassword
 * Server Actions, never by a browser directly. Same shared-secret pattern as every other
 * storefront-to-admin-panel internal route: the storefront must never hold a service-role key, so
 * it asks admin-panel (which already holds one) to run the one-bit eligibility check from
 * 037-password-reset-eligibility.sql and hand back only `{ allowed: boolean }` -- never the
 * underlying auth.users/customers/admin_users rows that produced it.
 *
 * Its own secret (not INTERNAL_DRAFT_ORDER_SECRET/INTERNAL_ORDER_HISTORY_SECRET/
 * INTERNAL_REGISTRATION_CLEANUP_SECRET) -- a leak of this one only lets someone ask "is this email
 * reset-eligible", not create orders, read order history, or delete an applicant.
 */
export async function POST(request: NextRequest) {
  if (!isInternalRequestAuthorized(request, SECRET_ENV)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const text = await request.text();
  if (text.length > MAX_INTERNAL_JSON_BODY_CHARS) {
    return NextResponse.json({ error: 'request too large' }, { status: 413 });
  }

  let body: { email?: string };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (typeof body.email !== 'string' || !body.email || body.email.length > MAX_EMAIL_LENGTH) {
    return NextResponse.json({ error: 'missing or invalid field: email' }, { status: 400 });
  }

  const service = createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await service.rpc('password_reset_allowed', { p_email: body.email });
  if (error) {
    console.error('[internal-password-reset-eligibility] RPC failed:', error.message);
    return NextResponse.json({ error: 'temporarily unavailable' }, { status: 503 });
  }

  return NextResponse.json({ allowed: data === true }, { status: 200 });
}
