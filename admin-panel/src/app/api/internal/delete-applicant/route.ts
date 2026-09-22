import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { isInternalRequestAuthorized } from '@/lib/internal-auth';
import { MAX_CLEANUP_BODY_CHARS, decideCleanup, parseCleanupInput } from '@/lib/applicant-cleanup';

export const runtime = 'nodejs';

const SECRET_ENV = 'INTERNAL_REGISTRATION_CLEANUP_SECRET';
const DOCUMENTS_BUCKET = 'registration-documents';

/**
 * Called by the storefront when a registration fails AFTER its Auth user was created, so a failed
 * sign-up never leaves an account nobody can use (the same email would otherwise collide forever).
 * This lives here so the buyer-facing storefront never holds the Supabase service-role key.
 *
 * Trust boundary: its own shared secret (not the draft-order one -- a leak of that must not allow
 * deleting users) AND the eligibility rules in lib/applicant-cleanup.ts: only a just-created
 * account with no application that is not an admin can be removed.
 */
export async function POST(request: NextRequest) {
  if (!isInternalRequestAuthorized(request, SECRET_ENV)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const text = await request.text();
  if (text.length > MAX_CLEANUP_BODY_CHARS) {
    return NextResponse.json({ error: 'request too large' }, { status: 413 });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }
  const userId = parseCleanupInput(raw);
  if (!userId) return NextResponse.json({ error: 'invalid request' }, { status: 400 });

  const service = createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: userData, error: userError } = await service.auth.admin.getUserById(userId);
  if (userError || !userData?.user) {
    // Already gone (or never existed): nothing to do, and the caller's goal is met.
    return NextResponse.json({ deleted: false }, { status: 404 });
  }

  const [{ data: customerRow, error: customerError }, { data: adminRow, error: adminError }] = await Promise.all([
    service.from('customers').select('id').eq('supabase_user_id', userId).maybeSingle(),
    service.from('admin_users').select('id').eq('user_id', userId).maybeSingle(),
  ]);
  if (customerError || adminError) {
    console.error('[delete-applicant] eligibility lookup failed:', customerError?.message ?? adminError?.message);
    return NextResponse.json({ error: 'temporarily unavailable' }, { status: 503 });
  }

  const decision = decideCleanup({
    createdAt: userData.user.created_at,
    hasCustomerRow: Boolean(customerRow),
    isAdmin: Boolean(adminRow),
  });
  if (!decision.ok) {
    console.error('[delete-applicant] refused:', decision.reason);
    return NextResponse.json({ error: 'not eligible' }, { status: 409 });
  }

  // Belt and braces: the storefront already tries to remove the files with the applicant's own
  // session; sweep whatever is left in their folder so no personal document is orphaned.
  try {
    const { data: files } = await service.storage.from(DOCUMENTS_BUCKET).list(userId);
    if (files && files.length > 0) {
      await service.storage.from(DOCUMENTS_BUCKET).remove(files.map((f) => `${userId}/${f.name}`));
    }
  } catch (err) {
    console.error('[delete-applicant] document sweep failed:', err);
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('[delete-applicant] deleteUser failed:', deleteError.message);
    return NextResponse.json({ error: 'temporarily unavailable' }, { status: 502 });
  }
  return NextResponse.json({ deleted: true }, { status: 200 });
}
