import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OrderIdempotency, orderIdempotencyKey } from '../../src/lib/order-idempotency';

describe('orderIdempotencyKey (O-1)', () => {
  it('is order-independent: the same lines in a different order produce the same key', () => {
    const a = orderIdempotencyKey({ customerId: 'c1', fulfillmentMethod: 'ship', lineItems: [{ variantId: 'v1', quantity: 1 }, { variantId: 'v2', quantity: 2 }] });
    const b = orderIdempotencyKey({ customerId: 'c1', fulfillmentMethod: 'ship', lineItems: [{ variantId: 'v2', quantity: 2 }, { variantId: 'v1', quantity: 1 }] });
    assert.equal(a, b);
  });
  it('differs when the customer, method, variant or quantity differs', () => {
    const base = { customerId: 'c1', fulfillmentMethod: 'ship', lineItems: [{ variantId: 'v1', quantity: 1 }] };
    const variants = [
      { ...base, customerId: 'c2' },
      { ...base, fulfillmentMethod: 'pickup' },
      { ...base, lineItems: [{ variantId: 'v1', quantity: 2 }] },
      { ...base, lineItems: [{ variantId: 'v9', quantity: 1 }] },
    ];
    const keys = new Set([orderIdempotencyKey(base), ...variants.map(orderIdempotencyKey)]);
    assert.equal(keys.size, 1 + variants.length);
  });
});

describe('OrderIdempotency.run (O-1: double-click / retry creates only one order)', () => {
  it('two CONCURRENT calls with the same key share the same in-flight result (the double-click race)', async () => {
    let calls = 0;
    const idem = new OrderIdempotency<{ ok: true; id: number }>();
    const create = () =>
      new Promise<{ ok: true; id: number }>((resolve) => {
        calls++;
        setTimeout(() => resolve({ ok: true, id: calls }), 20);
      });
    const [a, b] = await Promise.all([idem.run('k1', create), idem.run('k1', create)]);
    assert.equal(calls, 1, 'create() must run only once for concurrent duplicates');
    assert.deepEqual(a, b);
  });

  it('a call AFTER a successful one, still inside the window, returns the SAME cached result', async () => {
    let calls = 0;
    const idem = new OrderIdempotency<{ ok: true; id: number }>(200);
    const create = async () => ({ ok: true as const, id: ++calls });
    const first = await idem.run('k2', create);
    const second = await idem.run('k2', create);
    assert.equal(calls, 1);
    assert.deepEqual(first, second);
  });

  it('a FAILED result is never cached: the very next call for the same key runs again', async () => {
    let calls = 0;
    const idem = new OrderIdempotency<{ ok: boolean; id: number }>();
    const create = async () => ({ ok: false, id: ++calls });
    await idem.run('k3', create);
    await idem.run('k3', create);
    assert.equal(calls, 2, 'a failed attempt must not block an immediate retry');
  });

  it('a THROWN error is never cached either', async () => {
    let calls = 0;
    const idem = new OrderIdempotency<{ ok: true; id: number }>();
    const create = async () => {
      calls++;
      if (calls === 1) throw new Error('transient');
      return { ok: true as const, id: calls };
    };
    await assert.rejects(idem.run('k4', create));
    const result = await idem.run('k4', create);
    assert.equal(calls, 2);
    assert.equal(result.id, 2);
  });

  it('different keys never share a result', async () => {
    let calls = 0;
    const idem = new OrderIdempotency<{ ok: true; id: number }>();
    const create = async () => ({ ok: true as const, id: ++calls });
    const a = await idem.run('kA', create);
    const b = await idem.run('kB', create);
    assert.notEqual(a.id, b.id);
  });

  it('after the window expires, the same key runs again (a genuinely new order later is allowed)', async () => {
    let calls = 0;
    const idem = new OrderIdempotency<{ ok: true; id: number }>(30);
    const create = async () => ({ ok: true as const, id: ++calls });
    await idem.run('k5', create);
    await new Promise((r) => setTimeout(r, 60));
    await idem.run('k5', create);
    assert.equal(calls, 2);
  });
});
