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

  console.log(`Inviting ${email}...`);
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);

  if (error) {
    throw new Error(`inviteUserByEmail failed: ${error.message}`);
  }
  console.log(`  invited — Supabase Auth user id: ${data.user.id}`);

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
