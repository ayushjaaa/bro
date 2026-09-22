import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { requireAdmin } from './admin-auth';
import { fetchAllRows } from '@/lib/supabase/paginate';

function getServiceRoleClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type FunnelStats = {
  registered: number;
  approved: number;
  firstLogin: number;
  addedToCart: number;
  orderRequestSubmitted: number;
  orderConfirmed: number;
  stuckApprovedNoLogin: { id: string; name: string; approvedAt: string }[];
  stuckOrderNotConfirmed: { orderId: string; changedAt: string }[];
};

const STALE_LOGIN_DAYS = 14;
const STALE_ORDER_DAYS = 7;
/** Q-2: caps how many pages of `cart_events`/`order_status_log` history the funnel walks, and how
 * many Auth users `listAllAuthUsers` below will page through -- both are append-only/growing
 * tables with no natural end, so an unbounded read here would eventually mean scanning the
 * business's entire history on every dashboard load. Generous enough that today's real data (low
 * thousands of rows) is nowhere close to it. */
const MAX_FUNNEL_EVENT_ROWS = 20000;
const MAX_AUTH_USER_PAGES = 20; // 20 * 1000/page = 200,000 users

/** `supabase.auth.admin.listUsers` returns at most one page (`perPage`, max 1000) per call -- a
 * single call silently undercounts "first login" once the customer base passes 1000 Auth users.
 * Pages through until either Supabase says there's nothing left or the safety cap above is hit. */
async function listAllAuthUsers(
  supabase: ReturnType<typeof getServiceRoleClient>
): Promise<Array<{ id: string; last_sign_in_at: string | null }>> {
  const users: Array<{ id: string; last_sign_in_at: string | null }> = [];
  for (let page = 1; page <= MAX_AUTH_USER_PAGES; page++) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    const pageUsers = data?.users ?? [];
    if (pageUsers.length === 0) break;
    users.push(...pageUsers.map((u) => ({ id: u.id, last_sign_in_at: u.last_sign_in_at as string | null })));
    if (pageUsers.length < 1000) break;
  }
  return users;
}

/** Computes the conversion funnel: Registered -> Approved -> First Login -> Order Request
 * Submitted -> Order Confirmed. First Login uses Supabase Auth's own free `last_sign_in_at` (no
 * storefront code change needed) via the Admin Auth API -- not a plain table join, since
 * auth.users isn't exposed through PostgREST. */
export async function getFunnelStats(): Promise<FunnelStats> {
  await requireAdmin();
  const supabase = getServiceRoleClient();

  // C3: `error` checked on both queries -- previously a transient Supabase failure silently
  // became `customers ?? []`/`registeredCount ?? 0`, so the dashboard would show "0 registered, 0
  // approved" indistinguishable from a genuine empty state, with nothing logged. Throwing here is
  // consistent with the rest of this file (fetchAllRows below propagates errors the same way).
  const { data: customers, error: customersError } = await supabase
    .from('customers')
    .select('id, first_name, last_name, supabase_user_id, status, approved_at')
    .eq('status', 'approved');
  if (customersError) throw new Error(customersError.message);
  const approvedCustomers = customers ?? [];

  const { count: registeredCount, error: registeredCountError } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true });
  if (registeredCountError) throw new Error(registeredCountError.message);

  const authUsers = await listAllAuthUsers(supabase);
  const lastSignInByUserId = new Map(authUsers.map((u) => [u.id, u.last_sign_in_at]));

  let firstLogin = 0;
  const staleCutoff = Date.now() - STALE_LOGIN_DAYS * 24 * 60 * 60 * 1000;
  const stuckApprovedNoLogin: FunnelStats['stuckApprovedNoLogin'] = [];
  for (const c of approvedCustomers) {
    const lastSignIn = c.supabase_user_id ? lastSignInByUserId.get(c.supabase_user_id) : null;
    if (lastSignIn) {
      firstLogin++;
    } else if (c.approved_at && new Date(c.approved_at).getTime() < staleCutoff) {
      stuckApprovedNoLogin.push({ id: c.id, name: `${c.first_name} ${c.last_name}`, approvedAt: c.approved_at });
    }
  }

  // "Ever added to cart" -- distinct customers, from the append-only history (cart_events), not
  // cart_snapshot (which only reflects the CURRENT cart and would undercount anyone who has since
  // emptied theirs -- the funnel should still credit them for having reached this stage).
  const cartEventRows = await fetchAllRows<{ customer_id: string | null }>(
    (from, to) => supabase.from('cart_events').select('customer_id').eq('action', 'add_to_cart').range(from, to),
    MAX_FUNNEL_EVENT_ROWS
  );
  const addedToCart = new Set(cartEventRows.map((r) => r.customer_id).filter(Boolean)).size;

  const statusRows = await fetchAllRows<{ order_id: string; new_status: string; changed_at: string }>(
    (from, to) =>
      supabase
        .from('order_status_log')
        .select('order_id, new_status, changed_at')
        .order('changed_at', { ascending: false })
        .range(from, to),
    MAX_FUNNEL_EVENT_ROWS
  );

  const latestStatusByOrder = new Map<string, { status: string; changedAt: string }>();
  for (const row of statusRows ?? []) {
    if (!latestStatusByOrder.has(row.order_id)) {
      latestStatusByOrder.set(row.order_id, { status: row.new_status, changedAt: row.changed_at });
    }
  }

  let orderRequestSubmitted = 0;
  let orderConfirmed = 0;
  const staleOrderCutoff = Date.now() - STALE_ORDER_DAYS * 24 * 60 * 60 * 1000;
  const stuckOrderNotConfirmed: FunnelStats['stuckOrderNotConfirmed'] = [];

  for (const [orderId, { status, changedAt }] of latestStatusByOrder) {
    if (orderId.includes('/DraftOrder/')) {
      orderRequestSubmitted++;
      if (status !== 'completed' && new Date(changedAt).getTime() < staleOrderCutoff) {
        stuckOrderNotConfirmed.push({ orderId, changedAt });
      }
    } else if (orderId.includes('/Order/')) {
      // A real Order's mere presence here proves orders/create fired at some point -- don't
      // require the LATEST logged status to still literally equal 'order_created', since a
      // near-simultaneous orders/updated (e.g. 'order_paid') can overwrite that position in the
      // per-order "latest status" lookup above, even though the order was genuinely confirmed.
      orderConfirmed++;
    }
  }

  return {
    registered: registeredCount ?? 0,
    approved: approvedCustomers.length,
    firstLogin,
    addedToCart,
    orderRequestSubmitted,
    orderConfirmed,
    stuckApprovedNoLogin,
    stuckOrderNotConfirmed,
  };
}
