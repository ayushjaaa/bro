import { redirect } from 'next/navigation';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import { DashboardShellAnimator } from '@/components/DashboardShellAnimator';
import { requireAdmin } from '@/data/admin-auth';

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
  } catch {
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
