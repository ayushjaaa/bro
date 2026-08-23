'use server';

import { redirect } from 'next/navigation';
import { signOutAdmin } from '@/data/admin-auth';

/** Thin Server Action — delegates to the DAL, then redirects. No direct Supabase call here. */
export async function signOutAction() {
  await signOutAdmin();
  redirect('/login');
}
