import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows } from '../../src/lib/supabase/paginate';

/** Regression test for the bug found live 2026-09-22: Supabase's hosted PostgREST caps a single
 * request at 1000 rows regardless of `.limit()` -- `product_health_snapshot` had 2035 real rows
 * and a plain `.limit(5000)` silently returned only the first 1000. This fakes that exact
 * behaviour (a page source that ignores anything past 1000 rows per call) to prove
 * `fetchAllRows` actually walks through every page instead of trusting one big `.limit()`. */
function fakeTable(totalRows: number) {
  const all = Array.from({ length: totalRows }, (_, i) => ({ id: i }));
  return (from: number, to: number) => Promise.resolve({ data: all.slice(from, to + 1) });
}

describe('fetchAllRows (PostgREST 1000-row-per-request cap workaround)', () => {
  it('returns every row when the table has more than 1000 rows (the exact bug found live)', async () => {
    const rows = await fetchAllRows(fakeTable(2035), 5000);
    assert.equal(rows.length, 2035);
  });

  it('stops at maxRows even if the table has more rows than that', async () => {
    const rows = await fetchAllRows(fakeTable(10000), 3000);
    assert.equal(rows.length, 3000);
  });

  it('returns everything without extra empty-page calls when the table is small', async () => {
    let calls = 0;
    const queryPage = (from: number, to: number) => {
      calls++;
      return Promise.resolve({ data: fakeTableRows(12).slice(from, to + 1) });
    };
    const rows = await fetchAllRows(queryPage, 5000);
    assert.equal(rows.length, 12);
    assert.equal(calls, 1);
  });

  it('handles an empty table and a null data response', async () => {
    assert.deepEqual(await fetchAllRows(() => Promise.resolve({ data: [] }), 5000), []);
    assert.deepEqual(await fetchAllRows(() => Promise.resolve({ data: null }), 5000), []);
  });
});

function fakeTableRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: i }));
}
