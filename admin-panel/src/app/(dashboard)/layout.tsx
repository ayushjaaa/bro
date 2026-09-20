import { redirect } from 'next/navigation';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import { DashboardShellAnimator } from '@/components/DashboardShellAnimator';
import { requireAdmin, AdminCheckUnavailableError } from '@/data/admin-auth';

/**
 * Every page under (dashboard) renders through this layout. proxy.ts already gates these routes
 * (session + admin_users check), but per DECISIONS.md item 44a-i's defense-in-depth rule, this
 * layout independently re-verifies too — if it somehow gets reached without a valid admin
 * session, redirect rather than trust that proxy.ts already handled it.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let email: string;
  try {
    ({ email } = await requireAdmin());
  } catch (err) {
    // A failed admin_users lookup (DB/network hiccup) is NOT the same as a real unauthorized
    // session — the user's login is still valid, we just couldn't confirm authorization. Show a
    // retry state instead of silently redirecting to /login, which previously looked exactly
    // like an unexplained auto-logout.
    if (err instanceof AdminCheckUnavailableError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
          <p className="text-lg font-medium">Couldn&apos;t verify your session</p>
          <p className="text-sm text-muted-foreground">
            This is usually temporary. Please refresh the page.
          </p>
        </div>
      );
    }
    redirect('/login');
  }

  return (
    <DashboardShellAnimator>
      <TopBar email={email} />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto p-6">{children}</main>
      </div>
    </DashboardShellAnimator>
  );
}
