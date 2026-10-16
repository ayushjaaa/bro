import { listCustomersPage, getPendingCustomerCount, listOrderStatusLog } from '@/data/customers';
import { listSalesReps, type SalesRep } from '@/data/sales-reps';
import { listNoteCountsFor } from '@/data/internal-notes';
import CustomersTable from '@/features/customers/components/CustomersTable';
import { CUSTOMERS_PAGE_SIZE } from '@/features/customers/constants';

export default async function CustomersPage() {
  // pendingCount is independent of whichever page of the main table is showing -- it must stay
  // accurate regardless of pagination, so it's its own count query, never derived from
  // firstPage.customers (which only ever holds one page's worth of rows).
  const [firstPage, pendingCount, orderStatusLog] = await Promise.all([
    listCustomersPage({ limit: CUSTOMERS_PAGE_SIZE, offset: 0 }),
    getPendingCustomerCount(),
    listOrderStatusLog(),
  ]);

  // Both features (015-sales-reps-and-notes.sql) degrade to "off" rather than breaking this
  // page if the migration hasn't been run yet against the live database -- same lesson as the
  // account_number incident earlier this session, applied preemptively here instead of
  // discovered the hard way. Self-activates the moment the migration is applied, no follow-up
  // code change needed.
  let salesReps: SalesRep[] = [];
  let salesRepsFailed = false;
  try {
    salesReps = await listSalesReps();
  } catch (err) {
    console.error('[customers] listSalesReps failed -- has 015-sales-reps-and-notes.sql been run?', err);
    salesRepsFailed = true;
  }

  let noteCounts = new Map<string, number>();
  let noteCountsFailed = false;
  try {
    noteCounts = await listNoteCountsFor(
      'customer',
      firstPage.customers.map((c) => c.id)
    );
  } catch (err) {
    console.error('[customers] listNoteCountsFor failed -- has 015-sales-reps-and-notes.sql been run?', err);
    noteCountsFailed = true;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Customers</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {pendingCount > 0
            ? `${pendingCount} pending request${pendingCount === 1 ? '' : 's'} awaiting review.`
            : 'No pending requests.'}
        </p>
      </div>

      <CustomersTable
        initialCustomers={firstPage.customers}
        initialTotalCount={firstPage.totalCount}
        initialOrderStatusLog={orderStatusLog}
        salesReps={salesReps}
        noteCounts={[...noteCounts.entries()]}
        salesRepsFailed={salesRepsFailed}
        noteCountsFailed={noteCountsFailed}
      />
    </div>
  );
}
