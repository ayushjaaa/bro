import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orderStatusFromState, draftStatusFromState, FINAL_DRAFT_STATUSES } from '../../src/lib/webhooks/order-status';
import { WebhookIdDedup } from '../../src/lib/webhooks/verify';

const order = (o: Partial<{ cancelledAt: string | null; financialStatus: string | null; fulfillmentStatus: string | null }>) =>
  orderStatusFromState({ cancelledAt: null, financialStatus: null, fulfillmentStatus: null, ...o });

describe('orderStatusFromState', () => {
  it('uses the payment state while nothing else has happened', () => {
    assert.equal(order({ financialStatus: 'paid' }), 'order_paid');
    assert.equal(order({ financialStatus: 'pending' }), 'order_pending');
    assert.equal(order({}), 'order_updated');
  });

  it('fulfilment beats payment, so a shipped order stops reading as just "paid"', () => {
    assert.equal(order({ financialStatus: 'paid', fulfillmentStatus: 'fulfilled' }), 'order_fulfilled');
    assert.equal(order({ financialStatus: 'paid', fulfillmentStatus: 'partial' }), 'order_partially_fulfilled');
  });

  it('money going back beats fulfilment', () => {
    assert.equal(order({ financialStatus: 'refunded', fulfillmentStatus: 'fulfilled' }), 'order_refunded');
    assert.equal(order({ financialStatus: 'partially_refunded' }), 'order_partially_refunded');
    assert.equal(order({ financialStatus: 'voided' }), 'order_voided');
  });

  it('cancelled beats everything (live case: cancel + refund + restock of #1044)', () => {
    assert.equal(order({ cancelledAt: '2026-11-12T10:46:28Z', financialStatus: 'refunded' }), 'order_cancelled');
    assert.equal(order({ cancelledAt: '2026-11-12T10:46:28Z', financialStatus: 'paid', fulfillmentStatus: 'fulfilled' }), 'order_cancelled');
  });

  it('accepts the GraphQL display enum spelling too (reconcile script)', () => {
    assert.equal(order({ financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }), 'order_fulfilled');
    assert.equal(order({ financialStatus: 'PARTIALLY_REFUNDED' }), 'order_partially_refunded');
  });

  it('every specific topic and the matching orders/updated agree, so the second delivery is a no-op', () => {
    const state = { cancelledAt: null, financialStatus: 'paid', fulfillmentStatus: 'fulfilled' };
    assert.equal(orderStatusFromState(state), orderStatusFromState({ ...state }));
  });
});

describe('draftStatusFromState', () => {
  it('passes Shopify draft status through, lowercased', () => {
    assert.equal(draftStatusFromState({ status: 'open' }), 'open');
    assert.equal(draftStatusFromState({ status: 'COMPLETED' }), 'completed');
    assert.equal(draftStatusFromState({ status: undefined }), 'unknown');
  });

  it('a deleted draft is final, so the funnel stops listing it as stuck', () => {
    assert.equal(draftStatusFromState(null), 'deleted');
    assert.ok(FINAL_DRAFT_STATUSES.has('deleted'));
    assert.ok(FINAL_DRAFT_STATUSES.has('completed'));
    assert.ok(!FINAL_DRAFT_STATUSES.has('open'));
  });
});

describe('WebhookIdDedup check/mark split', () => {
  it('a failed delivery (checked, never marked) is processed again on retry', () => {
    const dedup = new WebhookIdDedup();
    assert.equal(dedup.hasSeen('w1'), false);
    // processing failed -> route answers 500 and does not call markSeen
    assert.equal(dedup.hasSeen('w1'), false);
    dedup.markSeen('w1');
    assert.equal(dedup.hasSeen('w1'), true);
  });

  it('isDuplicate keeps its old check-and-record behaviour for the other routes', () => {
    const dedup = new WebhookIdDedup();
    assert.equal(dedup.isDuplicate('w2'), false);
    assert.equal(dedup.isDuplicate('w2'), true);
    assert.equal(dedup.isDuplicate(null), false);
  });

  it('expires after its TTL', async () => {
    const dedup = new WebhookIdDedup(5);
    dedup.markSeen('w3');
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(dedup.hasSeen('w3'), false);
  });
});
