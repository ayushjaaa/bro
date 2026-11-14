/**
 * The one place that decides what status string an order/draft-order event writes into
 * `order_status_log`. Shared by the orders webhook route and the reconcile script, so a status
 * recovered from Shopify after a lost webhook is spelled exactly like one the webhook would have
 * written.
 *
 * Every real-order topic (create / updated / cancelled / fulfilled / partially_fulfilled) derives
 * the status from the order's CURRENT state, not from which topic fired. Shopify sends
 * orders/updated alongside every specific topic, so two deliveries for the same change produce the
 * same string and `log_order_status_change_if_new` skips the second -- no flapping between
 * "fulfilled" and "paid" rows.
 *
 * Precedence: cancelled > refunded/voided > fulfilled > payment state.
 */
export type OrderState = {
  cancelledAt: string | null | undefined;
  /** REST `financial_status`, lowercase: 'pending' | 'paid' | 'refunded' | 'partially_refunded' | 'voided' | ... */
  financialStatus: string | null | undefined;
  /** REST `fulfillment_status`: 'fulfilled' | 'partial' | null */
  fulfillmentStatus: string | null | undefined;
};

const MONEY_RETURNED = new Set(['refunded', 'partially_refunded', 'voided']);

export function orderStatusFromState(order: OrderState): string {
  if (order.cancelledAt) return 'order_cancelled';
  const financial = order.financialStatus?.toLowerCase() || null;
  if (financial && MONEY_RETURNED.has(financial)) return `order_${financial}`;
  const fulfillment = order.fulfillmentStatus?.toLowerCase() || null;
  if (fulfillment === 'fulfilled') return 'order_fulfilled';
  if (fulfillment === 'partial') return 'order_partially_fulfilled';
  return `order_${financial ?? 'updated'}`;
}

/** Draft orders: Shopify's own status ('open' | 'invoice_sent' | 'completed'), or 'deleted'. */
export const DRAFT_DELETED_STATUS = 'deleted';

export function draftStatusFromState(draft: { status?: string | null } | null): string {
  if (!draft) return DRAFT_DELETED_STATUS;
  return draft.status?.toLowerCase() || 'unknown';
}

/** Statuses after which a draft can't change any more -- the funnel's "stuck" list skips these. */
export const FINAL_DRAFT_STATUSES = new Set(['completed', DRAFT_DELETED_STATUS]);
