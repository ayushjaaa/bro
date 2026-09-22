/**
 * Static guard on 023-create-customer-activity.sql: fails if a future edit re-opens the table. Runs
 * without a database. The live behaviour is covered by storefront/tests/security/activity.test.ts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '../../scripts/supabase/023-create-customer-activity.sql'), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n'); // ignore comments (incl. the ROLLBACK block)
const lower = sql.toLowerCase();

describe('023 customer_activity migration', () => {
  it('enables RLS on the table', () => {
    assert.match(lower, /alter table customer_activity enable row level security/);
  });

  it('has NO insert/update/delete policy -- writes only via the RPC', () => {
    assert.doesNotMatch(lower, /create policy[^;]*for\s+(insert|update|delete|all)/);
  });

  it('read policy is admin-only and never `using (true)`', () => {
    const policies = lower.match(/create policy[^;]*;/g) ?? [];
    assert.equal(policies.length, 1);
    assert.match(policies[0], /for select/);
    assert.match(policies[0], /is_current_user_admin\(\)/);
    assert.doesNotMatch(policies[0], /using \(true\)/);
  });

  it('RPC is SECURITY DEFINER with an empty search_path (no schema-hijack)', () => {
    assert.match(lower, /security definer/);
    assert.match(lower, /set search_path = ''/);
  });

  it('RPC identifies the customer from auth.uid() and requires status = approved', () => {
    assert.match(lower, /supabase_user_id = \(select auth\.uid\(\)\)/);
    assert.match(lower, /status = 'approved'/);
  });

  it('RPC takes ONLY p_events -- no client-supplied customer id parameter', () => {
    assert.match(lower, /log_customer_activity\(p_events jsonb\)/);
    assert.doesNotMatch(lower, /p_customer_id/);
  });

  it('RPC is revoked from public/anon and granted only to authenticated', () => {
    assert.match(lower, /revoke all on function public\.log_customer_activity\(jsonb\) from public, anon, authenticated/);
    assert.match(lower, /grant execute on function public\.log_customer_activity\(jsonb\) to authenticated;/);
    assert.doesNotMatch(lower, /grant[^;]*log_customer_activity[^;]*\banon\b/);
  });

  it('bounds its input: batch size, path length, rate, query-string stripping, timestamp clamp', () => {
    assert.match(lower, /jsonb_array_length\(p_events\) > 100/);
    assert.match(lower, /char_length\(path\) <= 200/);
    assert.match(lower, /> 400/);
    assert.match(lower, /split_part\(split_part\(e->>'path', '\?', 1\), '#', 1\)/);
    assert.match(lower, /now\(\) - interval '1 day'/);
  });

  it('only allows the known action type and schedules 30-day retention', () => {
    assert.match(lower, /check \(action in \('page_view'\)\)/);
    assert.match(lower, /interval '30 days'/);
    assert.match(lower, /cron\.schedule/);
  });
});
