import { listCustomers, listOrderStatusLog } from '@/data/customers';
import { listSalesReps, type SalesRep } from '@/data/sales-reps';
import { listNoteCountsFor } from '@/data/internal-notes';
import CustomersTable from '@/features/customers/components/CustomersTable';

export default async function CustomersPage() {
  const [customers, orderStatusLog] = await Promise.all([listCustomers(), listOrderStatusLog()]);
  const pendingCount = customers.filter((c) => c.status === 'pending').length;

  // Both features (015-sales-reps-and-notes.sql) degrade to "off" rather than breaking this
  // page if the migration hasn't been run yet against the live database -- same lesson as the
  // account_number incident earlier this session, applied preemptively here instead of
  // discovered the hard way. Self-activates the moment the migration is applied, no follow-up
  // code change needed.
  let salesReps: SalesRep[] = [];
  try {
    salesReps = await listSalesReps();
  } catch (err) {
    console.error('[customers] listSalesReps failed -- has 015-sales-reps-and-notes.sql been run?', err);
  }

  let noteCounts = new Map<string, number>();
  try {
    noteCounts = await listNoteCountsFor(
      'customer',
      customers.map((c) => c.id)
    );
  } catch (err) {
    console.error('[customers] listNoteCountsFor failed -- has 015-sales-reps-and-notes.sql been run?', err);
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
        customers={customers}
        initialOrderStatusLog={orderStatusLog}
        salesReps={salesReps}
        noteCounts={[...noteCounts.entries()]}
      />
    </div>
  );
}
