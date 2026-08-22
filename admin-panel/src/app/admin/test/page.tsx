import { requireAdmin } from '@/data/admin-auth';

/**
 * Temporary verification page — confirms requireAdmin() actually works end-to-end (Google
 * OAuth login -> getClaims() -> admin_users lookup) before building real admin features on it.
 */
export default async function AdminTestPage() {
  try {
    const admin = await requireAdmin();
    return (
      <div className="max-w-md mx-auto mt-24 p-6 rounded-lg border border-emerald-200 bg-emerald-50">
        <h1 className="text-lg font-semibold text-emerald-800">✓ Admin check passed</h1>
        <p className="text-sm text-emerald-700 mt-2">Logged in as: {admin.email}</p>
      </div>
    );
  } catch (err) {
    return (
      <div className="max-w-md mx-auto mt-24 p-6 rounded-lg border border-red-200 bg-red-50">
        <h1 className="text-lg font-semibold text-red-800">✗ Admin check failed</h1>
        <p className="text-sm text-red-700 mt-2">
          {err instanceof Error ? err.message : 'Unknown error'}
        </p>
      </div>
    );
  }
}
