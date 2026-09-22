/**
 * Supabase's hosted PostgREST defaults to a 1000-row cap on a single request, silently applied
 * regardless of a higher `.limit(...)` on the query -- live-verified 2026-09-22 against
 * `product_health_snapshot` (2035 real rows, `.limit(5000)` still only returned 1000). Every
 * "safety cap" on a growing table in this codebase (K1's `listCustomers`/`listOrderStatusLog`,
 * K2's dashboard health snapshots, Q-2's funnel event reads) needs to actually walk `.range()` in
 * PAGE_SIZE batches to reach its intended cap, not just call `.limit()` once and trust it.
 */
const PAGE_SIZE = 1000;

/**
 * Pages through `queryPage(from, to)` in PAGE_SIZE-row batches until either a page comes back
 * shorter than PAGE_SIZE (no more rows) or `maxRows` is reached, then returns everything
 * collected. `queryPage` should apply the same filters/ordering as the caller wants each time,
 * only varying the range -- e.g. `(from, to) => supabase.from('t').select('*').eq(...).range(from, to)`.
 */
export async function fetchAllRows<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  maxRows: number
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < maxRows; offset += PAGE_SIZE) {
    const to = Math.min(offset + PAGE_SIZE, maxRows) - 1;
    const { data } = await queryPage(offset, to);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}
