import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { requireAdmin } from './admin-auth';

export const ACTIVITY_PAGE_SIZE = 50;

export type ActivityRow = {
  id: number;
  path: string;
  eventAt: string;
  customerId: string;
  customerName: string;
  accountNumber: string | null;
};

/**
 * Customer page-view feed (customer_activity, written in one batch per browser per 5 minutes by
 * the storefront -- see 023-create-customer-activity.sql). Read once per page load on the server
 * with the service-role client after requireAdmin(); no polling, no realtime subscription.
 */
export async function listCustomerActivity(opts: { page: number; customerId?: string }) {
  await requireAdmin();
  const supabase = createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const from = (opts.page - 1) * ACTIVITY_PAGE_SIZE;
  let query = supabase
    .from('customer_activity')
    .select('id, customer_id, path, event_at', { count: 'estimated' })
    .order('event_at', { ascending: false })
    .range(from, from + ACTIVITY_PAGE_SIZE - 1);
  if (opts.customerId) query = query.eq('customer_id', opts.customerId);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const ids = [...new Set((data ?? []).map((r) => r.customer_id))];
  const names = new Map<string, { name: string; account: string | null }>();
  if (ids.length > 0) {
    const { data: customers, error: cErr } = await supabase
      .from('customers')
      .select('id, first_name, last_name, operating_name, account_number')
      .in('id', ids);
    if (cErr) throw new Error(cErr.message);
    for (const c of customers ?? []) {
      names.set(String(c.id), {
        name: c.operating_name || `${c.first_name} ${c.last_name}`.trim(),
        account: c.account_number,
      });
    }
  }

  const rows: ActivityRow[] = (data ?? []).map((r) => ({
    id: r.id,
    path: r.path,
    eventAt: r.event_at,
    customerId: r.customer_id,
    customerName: names.get(r.customer_id)?.name ?? 'Unknown customer',
    accountNumber: names.get(r.customer_id)?.account ?? null,
  }));
  return { rows, totalCount: count ?? rows.length };
}
