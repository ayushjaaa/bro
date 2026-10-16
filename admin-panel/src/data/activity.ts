import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { requireAdmin } from './admin-auth';
import { ACTIVITY_PAGE_SIZE } from './activity-constants';

export { ACTIVITY_PAGE_SIZE };

export type ActivityRow = {
  id: number;
  path: string;
  eventAt: string;
  customerId: string;
  customerName: string;
  accountNumber: string | null;
  firstName: string;
  lastName: string;
  businessName: string | null;
};

/**
 * Customer page-view feed (customer_activity, written in one batch per browser per 5 minutes by
 * the storefront -- see 023-create-customer-activity.sql). Read once per page load on the server
 * with the service-role client after requireAdmin(); no polling, no realtime subscription.
 *
 * `search` filters by customer name (first/last/business) -- resolved in a first pass against
 * `customers` (same table the name map below already queries) so the main query can filter
 * `customer_activity` by the matching `customer_id`s, rather than pulling a page of activity rows
 * and then discarding ones whose customer doesn't match client-side (which would make the page
 * size/pagination lie once a search is active).
 */
export async function listCustomerActivity(opts: { page: number; customerId?: string; search?: string }) {
  await requireAdmin();
  const supabase = createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Strips characters that are syntax in PostgREST's `.or()` filter string (`,()` separate/group
  // conditions, `%*` are ILIKE wildcards) -- not an injection risk (the client still parameterizes
  // the value), but left in they'd corrupt the filter or let a search term inject its own wildcard.
  const search = opts.search?.trim().replace(/[,()%*]/g, '');
  let searchCustomerIds: string[] | null = null;
  if (search) {
    const { data: matches, error: searchErr } = await supabase
      .from('customers')
      .select('id')
      .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,operating_name.ilike.%${search}%`);
    if (searchErr) throw new Error(searchErr.message);
    searchCustomerIds = (matches ?? []).map((c) => String(c.id));
    // No customer matches the search -- short-circuit rather than running a `.in('customer_id', [])`
    // query, which Postgres/PostgREST would otherwise need to evaluate against the whole table.
    if (searchCustomerIds.length === 0) return { rows: [], totalCount: 0 };
  }

  const from = (opts.page - 1) * ACTIVITY_PAGE_SIZE;
  let query = supabase
    .from('customer_activity')
    .select('id, customer_id, path, event_at', { count: 'estimated' })
    .order('event_at', { ascending: false })
    .range(from, from + ACTIVITY_PAGE_SIZE - 1);
  if (opts.customerId) query = query.eq('customer_id', opts.customerId);
  if (searchCustomerIds) query = query.in('customer_id', searchCustomerIds);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const ids = [...new Set((data ?? []).map((r) => r.customer_id))];
  const names = new Map<
    string,
    { name: string; account: string | null; firstName: string; lastName: string; businessName: string | null }
  >();
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
        firstName: c.first_name ?? '',
        lastName: c.last_name ?? '',
        businessName: c.operating_name ?? null,
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
    firstName: names.get(r.customer_id)?.firstName ?? '',
    lastName: names.get(r.customer_id)?.lastName ?? '',
    businessName: names.get(r.customer_id)?.businessName ?? null,
  }));
  return { rows, totalCount: count ?? rows.length };
}
