import Link from 'next/link';
import { listCustomerActivity, ACTIVITY_PAGE_SIZE } from '@/data/activity';

/**
 * Which customer opened which page, and when. Server-rendered once per visit (no polling): the
 * storefront sends page views in one batch per browser every ~5 minutes, so data can be up to
 * 5 minutes behind -- reload the page to see newer batches.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; customer?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const customerId = sp.customer && /^[\w-]{1,64}$/.test(sp.customer) ? sp.customer : undefined;

  const { rows, totalCount } = await listCustomerActivity({ page, customerId });
  const totalPages = Math.max(1, Math.ceil(totalCount / ACTIVITY_PAGE_SIZE));
  const qs = (p: number) => `/activity?page=${p}${customerId ? `&customer=${customerId}` : ''}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Activity</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Which customer opened which page. Updates in batches (about every 5 minutes) — reload to see newer activity.
          Kept for 30 days.
        </p>
        {customerId && (
          <Link href="/activity" className="text-sm text-purple-700 hover:underline">
            ← Show all customers
          </Link>
        )}
      </div>

      <div className="rounded-lg border border-neutral-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-600">
            <tr>
              <th className="px-4 py-2 font-medium">Customer</th>
              <th className="px-4 py-2 font-medium">Page</th>
              <th className="px-4 py-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-500">
                  No activity yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <Link href={`/activity?customer=${encodeURIComponent(r.customerId)}`} className="hover:underline">
                    {r.customerName}
                  </Link>
                  {r.accountNumber && <span className="ml-2 text-xs text-neutral-400">{r.accountNumber}</span>}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{r.path}</td>
                <td className="px-4 py-2 text-neutral-500 whitespace-nowrap">
                  {new Date(r.eventAt).toLocaleString('en-CA', { timeZone: 'America/Toronto' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 text-sm">
        {page > 1 && <Link href={qs(page - 1)} className="hover:underline">← Newer</Link>}
        <span className="text-neutral-500">Page {page} of {totalPages}</span>
        {page < totalPages && <Link href={qs(page + 1)} className="hover:underline">Older →</Link>}
      </div>
    </div>
  );
}
