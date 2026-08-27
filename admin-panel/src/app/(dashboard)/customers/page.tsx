import { listCustomers, listCartActivity, listCartSnapshot, listOrderStatusLog } from '@/data/customers';
import CustomersTable from '@/features/customers/components/CustomersTable';
import CartActivityList from '@/features/customers/components/CartActivityList';

export default async function CustomersPage() {
  const [customers, cartActivity, cartSnapshot, orderStatusLog] = await Promise.all([
    listCustomers(),
    listCartActivity(),
    listCartSnapshot(),
    listOrderStatusLog(),
  ]);
  const pendingCount = customers.filter((c) => c.status === 'pending').length;

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

      <CustomersTable customers={customers} initialCartSnapshot={cartSnapshot} initialOrderStatusLog={orderStatusLog} />

      <div>
        <h2 className="text-sm font-semibold text-neutral-700 mb-2">Cart Activity</h2>
        <CartActivityList initialEvents={cartActivity} />
      </div>
    </div>
  );
}
