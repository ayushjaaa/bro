/**
 * One-time script — creates/invites a new admin and prints a link to set their password.
 *
 * Official Supabase pattern (confirmed 2026-08-22, supabase.com/docs/guides/auth/passwords):
 * uses generateLink() to get a `hashed_token`, then builds our OWN URL pointing at our own
 * /auth/confirm route — NOT Supabase's hosted /auth/v1/verify redirect (action_link), which this
 * script used before and which didn't hand off a session reliably for this project's setup.
 * /auth/confirm calls verifyOtp({ type, token_hash }) server-side and redirects to /set-password.
 *
 * type: 'invite' works only for brand-new users; 'recovery' works for existing ones (including a
 * user who was invited but never set a password) — this script tries 'invite' first and falls
 * back to 'recovery' automatically.
 *
 * Also adds the email to admin_users (item 44a-i) so requireAdmin() and proxy.ts actually let
 * them into the admin panel once they've set a password.
 *
 * Run: npm run supabase:invite-admin -- someone@example.com
 */
import { createClient } from '@supabase/supabase-js';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run supabase:invite-admin -- someone@example.com');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  async function tryGenerateLink(type: 'invite' | 'recovery') {
    return supabase.auth.admin.generateLink({ type, email });
  }

  console.log(`Generating link for ${email}...`);
  let linkType: 'invite' | 'recovery' = 'invite';
  let { data, error } = await tryGenerateLink(linkType);

  if (error) {
    console.log(`  invite type failed (${error.message}) — trying recovery (existing user)`);
    linkType = 'recovery';
    ({ data, error } = await tryGenerateLink(linkType));
  }

  if (error || !data.properties) {
    throw new Error(`generateLink failed: ${error?.message ?? 'no properties returned'}`);
  }

  const confirmUrl = new URL('/auth/confirm', appUrl);
  confirmUrl.searchParams.set('token_hash', data.properties.hashed_token);
  confirmUrl.searchParams.set('type', linkType);
  confirmUrl.searchParams.set('next', '/set-password');

  console.log(`  link: ${confirmUrl.toString()}`);

  const { error: insertError } = await supabase
    .from('admin_users')
    .insert({ email })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      console.log(`  already in admin_users, skipping insert`);
    } else {
      throw new Error(`admin_users insert failed: ${insertError.message}`);
    }
  } else {
    console.log(`  added to admin_users`);
  }

  console.log(`\nDone. Open the link above to set a password.`);
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
