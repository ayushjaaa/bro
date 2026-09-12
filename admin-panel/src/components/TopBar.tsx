import Image from 'next/image';
import Breadcrumb from './Breadcrumb';
import { signOutAction } from '@/features/auth/actions';

/**
 * Server Component — receives the admin's verified email as a prop from (dashboard)/layout.tsx
 * (which already called requireAdmin() to render the layout at all), rather than re-fetching it.
 */
export default function TopBar({ email }: { email: string }) {
  return (
    <header className="h-14 shrink-0 border-b border-neutral-200 bg-white flex items-center gap-4 px-4">
      {/* Real brand asset (public/logoGemin.svg), same file the storefront's own Logo.tsx uses
         -- replaces the plain "Admin Panel" text so both apps carry the same identity. */}
      <div className="flex items-center gap-2 shrink-0">
        <Image src="/logoGemin.svg" alt="Gemini Distribution" width={140} height={28} className="h-6 w-auto" priority />
        <span className="text-xs font-medium text-neutral-400 border-l border-neutral-200 pl-2">Admin</span>
      </div>
      <div className="flex-1">
        <Breadcrumb />
      </div>
      <span className="text-sm text-neutral-500 shrink-0">{email}</span>
      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 bg-white text-neutral-700 text-sm font-medium px-3 py-1.5 hover:bg-neutral-50 shrink-0"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}
