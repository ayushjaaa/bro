/**
 * One-time script — invites a new admin: creates their Supabase Auth user via
 * inviteUserByEmail() (they get an email with a link to set their own password, official
 * Supabase pattern — no public sign-up), then adds their email to admin_users (item 44a-i) so
 * requireAdmin() and proxy.ts actually let them into the admin panel once they've set a password.
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

  // Corrected 2026-08-22: admin-generated recovery/invite links use the hash-based implicit flow
  // (#access_token=...), not a PKCE `?code=` query param — confirmed by server logs showing zero
  // query params on arrival. A hash only survives if the browser lands DIRECTLY on this URL with
  // no server-side redirect in between (a redirect's Location header drops it), so point straight
  // at /set-password instead of routing through an intermediate confirm step.
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/set-password`;

  console.log(`Inviting ${email}...`);
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });

  if (error) {
    if (error.code === 'email_exists') {
      // Already invited before (e.g. re-running this script with an old redirectTo) — generate a
      // fresh link with the correct redirectTo instead of failing. generateLink() does not send
      // an email itself; print the link so it can be opened directly.
      console.log(`  already exists — generating a fresh link instead`);
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'recovery', // 'invite' only works for brand-new users; this account already exists
        email,
        options: { redirectTo },
      });
      if (linkError) {
        throw new Error(`generateLink failed: ${linkError.message}`);
      }
      console.log(`  link: ${linkData.properties.action_link}`);
    } else {
      throw new Error(`inviteUserByEmail failed: ${error.message}`);
    }
  } else {
    console.log(`  invited — Supabase Auth user id: ${data.user.id}`);
  }

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

  console.log(`\nDone. Check ${email}'s inbox for the invite link to set a password.`);
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
