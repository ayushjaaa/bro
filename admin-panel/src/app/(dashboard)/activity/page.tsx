import { listCustomerActivity } from '@/data/activity';
import ActivityTable from '@/features/activity/components/ActivityTable';

/**
 * Which customer opened which page, and when. Server-rendered once per visit (no polling): the
 * storefront sends page views in one batch per browser every ~5 minutes, so data can be up to
 * 5 minutes behind -- reload the page to see newer batches. Search/sort/pagination past the first
 * page are handled client-side by ActivityTable (features/activity/components/ActivityTable.tsx),
 * same split as /cart's CartOverview.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const sp = await searchParams;
  const customerId = sp.customer && /^[\w-]{1,64}$/.test(sp.customer) ? sp.customer : undefined;

  const { rows, totalCount } = await listCustomerActivity({ page: 1, customerId });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Activity</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Which customer opened which page. Updates in batches (about every 5 minutes) — reload to see newer activity.
          Kept for 30 days.
        </p>
      </div>

      <ActivityTable initialRows={rows} initialTotalCount={totalCount} customerId={customerId} />
    </div>
  );
}
