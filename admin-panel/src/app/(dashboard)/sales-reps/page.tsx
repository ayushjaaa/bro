import { listCustomers, listOrderStatusLog } from '@/data/customers';
import { listSalesReps } from '@/data/sales-reps';
import SalesRepsManager from '@/features/sales-reps/components/SalesRepsManager';

export default async function SalesRepsPage() {
  const [salesReps, customers, orderStatusLog] = await Promise.all([
    listSalesReps(),
    listCustomers(),
    listOrderStatusLog(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Sales Reps</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Manage the rep directory and see each rep&apos;s assigned accounts.
        </p>
      </div>

      <SalesRepsManager salesReps={salesReps} customers={customers} initialOrderStatusLog={orderStatusLog} />
    </div>
  );
}
