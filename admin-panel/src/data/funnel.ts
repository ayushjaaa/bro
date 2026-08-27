import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { requireAdmin } from './admin-auth';

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

/** Computes the conversion funnel: Registered -> Approved -> First Login -> Order Request
 * Submitted -> Order Confirmed. First Login uses Supabase Auth's own free `last_sign_in_at` (no
 * storefront code change needed) via the Admin Auth API -- not a plain table join, since
 * auth.users isn't exposed through PostgREST. */
export async function getFunnelStats(): Promise<FunnelStats> {
  await requireAdmin();
  const supabase = getServiceRoleClient();

  const { data: customers } = await supabase
    .from('customers')
    .select('id, first_name, last_name, supabase_user_id, status, approved_at')
    .eq('status', 'approved');
  const approvedCustomers = customers ?? [];

  const { count: registeredCount } = await supabase.from('customers').select('*', { count: 'exact', head: true });

  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const lastSignInByUserId = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, u.last_sign_in_at as string | null])
  );

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
  const { data: cartEventRows } = await supabase
    .from('cart_events')
    .select('customer_id')
    .eq('action', 'add_to_cart');
  const addedToCart = new Set((cartEventRows ?? []).map((r) => r.customer_id).filter(Boolean)).size;

  const { data: statusRows } = await supabase
    .from('order_status_log')
    .select('order_id, new_status, changed_at')
    .order('changed_at', { ascending: false });

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
