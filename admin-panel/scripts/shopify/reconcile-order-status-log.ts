/**
 * Repairs `order_status_log` from Shopify's own current state -- for events the orders webhook
 * never recorded (lost deliveries before the route awaited its write, topics that weren't
 * subscribed yet, drafts deleted with no delete webhook).
 *
 * For every draft order and order in Shopify, compares its CURRENT status (spelled by the same
 * lib/webhooks/order-status.ts the webhook uses) with the latest status logged for it, and logs
 * the current one through the same `log_order_status_change_if_new` RPC when they differ. A draft
 * still in the log as not-final but gone from Shopify is logged as 'deleted'.
 *
 * Only adds rows; never edits or removes existing history. Dry run by default.
 *
 * Run: npm run shopify:reconcile-order-status-log            (prints what it would log)
 *      npm run shopify:reconcile-order-status-log -- --apply (actually logs it)
 */
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import {
  draftStatusFromState,
  orderStatusFromState,
  DRAFT_DELETED_STATUS,
  FINAL_DRAFT_STATUSES,
} from '../../src/lib/webhooks/order-status';

const DRAFTS_QUERY = /* GraphQL */ `
  query ReconcileDrafts($after: String) {
    draftOrders(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id name status updatedAt customer { id } }
    }
  }
`;

const ORDERS_QUERY = /* GraphQL */ `
  query ReconcileOrders($after: String) {
    orders(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id name updatedAt cancelledAt displayFinancialStatus displayFulfillmentStatus customer { id } }
    }
  }
`;

type Page<T> = { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: T[] };
type ShopifyDraft = { id: string; name: string; status: string; updatedAt: string; customer: { id: string } | null };
type ShopifyOrder = {
  id: string;
  name: string;
  updatedAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  customer: { id: string } | null;
};

type Planned = { orderId: string; label: string; customerId: string | null; status: string; changedAt: string; was: string | null };

async function fetchAll<T>(query: string, key: string): Promise<T[]> {
  const all: T[] = [];
  let after: string | null = null;
  do {
    const data: Record<string, Page<T>> = await shopifyAdminRequest<Record<string, Page<T>>>(query, { after });
    all.push(...data[key].nodes);
    after = data[key].pageInfo.hasNextPage ? data[key].pageInfo.endCursor : null;
  } while (after);
  return all;
}

/** GraphQL's display enum -> the REST `fulfillment_status` value the webhook payload carries. */
function restFulfillmentStatus(display: string | null): string | null {
  if (display === 'FULFILLED') return 'fulfilled';
  if (display === 'PARTIALLY_FULFILLED') return 'partial';
  return null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Latest logged status per order id (rows come newest-first, so the first one seen wins).
  const latest = new Map<string, { status: string; customerId: string | null }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('order_status_log')
      .select('order_id, customer_id, new_status, changed_at')
      .order('changed_at', { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data) {
      if (!latest.has(row.order_id)) latest.set(row.order_id, { status: row.new_status, customerId: row.customer_id });
    }
    if (data.length < 1000) break;
  }

  const drafts = await fetchAll<ShopifyDraft>(DRAFTS_QUERY, 'draftOrders');
  const orders = await fetchAll<ShopifyOrder>(ORDERS_QUERY, 'orders');
  console.log(`Shopify: ${drafts.length} draft orders, ${orders.length} orders. Log: ${latest.size} ids.`);

  const planned: Planned[] = [];
  const plan = (orderId: string, label: string, customerId: string | null, status: string, changedAt: string) => {
    const was = latest.get(orderId)?.status ?? null;
    if (was !== status) planned.push({ orderId, label, customerId, status, changedAt, was });
  };

  for (const d of drafts) plan(d.id, d.name, d.customer?.id ?? null, draftStatusFromState(d), d.updatedAt);
  for (const o of orders) {
    const status = orderStatusFromState({
      cancelledAt: o.cancelledAt,
      financialStatus: o.displayFinancialStatus,
      fulfillmentStatus: restFulfillmentStatus(o.displayFulfillmentStatus),
    });
    plan(o.id, o.name, o.customer?.id ?? null, status, o.updatedAt);
  }

  const liveDraftIds = new Set(drafts.map((d) => d.id));
  const now = new Date().toISOString();
  for (const [orderId, { status, customerId }] of latest) {
    if (orderId.includes('/DraftOrder/') && !liveDraftIds.has(orderId) && !FINAL_DRAFT_STATUSES.has(status)) {
      plan(orderId, orderId.split('/').pop()!, customerId, DRAFT_DELETED_STATUS, now);
    }
  }

  for (const p of planned) console.log(`  ${p.label.padEnd(14)} ${String(p.was ?? '(none)').padEnd(22)} -> ${p.status}`);
  console.log(`${planned.length} status rows to log.`);
  if (!apply) {
    console.log('Dry run -- nothing written. Re-run with --apply to log them.');
    return;
  }

  let failed = 0;
  for (const p of planned) {
    const { error } = await supabase.rpc('log_order_status_change_if_new', {
      p_order_id: p.orderId,
      p_customer_id: p.customerId,
      p_new_status: p.status,
      p_changed_at: p.changedAt,
    });
    if (error) {
      failed++;
      console.error(`  failed ${p.label}:`, error.message);
    }
  }
  console.log(`Logged ${planned.length - failed}, failed ${failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
