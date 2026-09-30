import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldAttemptReconnect,
  shouldResyncOnSubscribe,
  applyRealtimePayload,
} from '../../src/features/dashboard/hooks/useLiveTable';

// This tests useLiveTable's reconnect/resync decision logic directly, as pure functions -- this
// project has no React-hook-testing setup, and a live browser network-drop simulation turned out
// to be unreliable (Playwright's context.setOffline() didn't reliably sever an established
// WebSocket in local testing -- see useLiveTable.ts's own doc comment). Testing the actual
// decision logic deterministically here is more reliable than a flaky, slow network simulation.

test('shouldAttemptReconnect: only on a genuine disconnect, and never while already reconnecting', () => {
  assert.equal(shouldAttemptReconnect('disconnected', false), true);
  assert.equal(shouldAttemptReconnect('disconnected', true), false, 'must not start a second concurrent reconnect');
  assert.equal(shouldAttemptReconnect('connected', false), false);
  assert.equal(shouldAttemptReconnect('connecting', false), false);
});

test('shouldResyncOnSubscribe: never on the first subscribe, even with onReconnect available', () => {
  assert.equal(shouldResyncOnSubscribe('SUBSCRIBED', false, true), false, 'first subscribe is covered by initialRows, not a resync');
});

test('shouldResyncOnSubscribe: resyncs on a real reconnect when onReconnect is provided', () => {
  assert.equal(shouldResyncOnSubscribe('SUBSCRIBED', true, true), true);
});

test('shouldResyncOnSubscribe: does nothing if no onReconnect was given, even on a real reconnect', () => {
  assert.equal(shouldResyncOnSubscribe('SUBSCRIBED', true, false), false);
});

test('shouldResyncOnSubscribe: ignores non-SUBSCRIBED statuses', () => {
  assert.equal(shouldResyncOnSubscribe('CHANNEL_ERROR', true, true), false);
  assert.equal(shouldResyncOnSubscribe('TIMED_OUT', true, true), false);
});

test('applyRealtimePayload: INSERT/UPDATE sets the row by its key', () => {
  const prev = new Map<string, { id: string; name: string }>();
  const next = applyRealtimePayload(prev, { eventType: 'INSERT', new: { id: '1', name: 'A' }, old: null }, (r) => r.id);
  assert.equal(next.get('1')?.name, 'A');
  assert.equal(prev.size, 0, 'must not mutate the previous Map');
});

test('applyRealtimePayload: DELETE removes the row by its OLD key', () => {
  const prev = new Map([['1', { id: '1', name: 'A' }]]);
  const next = applyRealtimePayload(prev, { eventType: 'DELETE', new: null, old: { id: '1', name: 'A' } }, (r) => r.id);
  assert.equal(next.has('1'), false);
});

test('applyRealtimePayload: without mapRow, applies the raw payload directly (existing tables\' behavior, unchanged)', () => {
  const prev = new Map<string, any>();
  const next = applyRealtimePayload(prev, { eventType: 'UPDATE', new: { id: '1', product_id: 'p1' }, old: null }, (r) => r.id);
  assert.deepEqual(next.get('1'), { id: '1', product_id: 'p1' });
});

test('applyRealtimePayload: with mapRow, transforms the raw payload before storing (the bug fix)', () => {
  const prev = new Map<string, { id: string; firstName: string }>();
  const mapRow = (raw: any) => ({ id: raw.id, firstName: raw.first_name });
  const next = applyRealtimePayload(prev, { eventType: 'UPDATE', new: { id: '1', first_name: 'Priya' }, old: null }, (r) => r.id, mapRow);
  assert.equal(next.get('1')?.firstName, 'Priya', 'raw snake_case payload must go through mapRow, not be stored as-is');
});

test('applyRealtimePayload: without orderKeyOf, applies whatever arrives (existing behavior, unchanged)', () => {
  const prev = new Map([['1', { id: '1', version: 5, name: 'Newer' }]]);
  const next = applyRealtimePayload(prev, { eventType: 'UPDATE', new: { id: '1', version: 3, name: 'Older' }, old: null }, (r) => r.id);
  assert.equal(next.get('1')?.name, 'Older', 'with no ordering key given, the caller gets the old (naive) behavior -- last-applied wins');
});

test('applyRealtimePayload: with orderKeyOf, an out-of-order (older) update is ignored, not applied (out-of-order edge case)', () => {
  const prev = new Map([['1', { id: '1', version: 5, name: 'Newer' }]]);
  const next = applyRealtimePayload(
    prev,
    { eventType: 'UPDATE', new: { id: '1', version: 3, name: 'Older' }, old: null },
    (r) => r.id,
    undefined,
    (r) => r.version
  );
  assert.equal(next.get('1')?.name, 'Newer', 'a payload with an OLDER version must not roll the row backward');
  assert.equal(next, prev, 'nothing changed, so this should even be the same Map reference (no unnecessary re-render)');
});

test('applyRealtimePayload: with orderKeyOf, a genuinely newer update still applies normally', () => {
  const prev = new Map([['1', { id: '1', version: 5, name: 'Older' }]]);
  const next = applyRealtimePayload(
    prev,
    { eventType: 'UPDATE', new: { id: '1', version: 6, name: 'Newer' }, old: null },
    (r) => r.id,
    undefined,
    (r) => r.version
  );
  assert.equal(next.get('1')?.name, 'Newer');
});

test('applyRealtimePayload: with orderKeyOf, a brand-new row (no previous entry) always applies -- the guard only protects existing rows', () => {
  const prev = new Map<string, any>();
  const next = applyRealtimePayload(
    prev,
    { eventType: 'INSERT', new: { id: '1', version: 1, name: 'Brand New' }, old: null },
    (r) => r.id,
    undefined,
    (r) => r.version
  );
  assert.equal(next.get('1')?.name, 'Brand New');
});

test('applyRealtimePayload: mapRow receives the PREVIOUS entry, so it can carry over fields a partial payload lacks', () => {
  const prev = new Map([['1', { id: '1', firstName: 'Priya', repName: 'Aman' }]]);
  // Simulates a partial UPDATE payload (only status changed) that has no rep info at all --
  // mapRow should be able to fall back to the previous entry's repName.
  const mapRow = (raw: any, previous: any) => ({ id: raw.id, firstName: raw.first_name ?? previous?.firstName, repName: previous?.repName ?? null });
  const next = applyRealtimePayload(prev, { eventType: 'UPDATE', new: { id: '1', first_name: 'Priya' }, old: null }, (r) => r.id, mapRow);
  assert.equal(next.get('1')?.repName, 'Aman', 'mapRow should have been able to see the previous entry to carry this over');
});
