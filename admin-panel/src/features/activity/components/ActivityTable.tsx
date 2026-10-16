'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ActivityRow } from '@/data/activity';
import { ACTIVITY_PAGE_SIZE } from '@/data/activity-constants';
import { getActivityPageAction } from '../actions';
import { CaretIcon } from '@/components/icons';

type ColumnKey = 'id' | 'firstName' | 'lastName' | 'businessName' | 'path' | 'eventAt';

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'businessName', label: 'Business Name' },
  { key: 'path', label: 'Last Page Visit' },
  { key: 'eventAt', label: 'Last Visited At' },
];

type SortDir = 'asc' | 'desc';

/** Matches CartOverview's SortableHeader (features/customers/components/CartOverview.tsx) --
 * same ▲▼ CaretIcon indicator, same dimmed-until-active styling, kept local here since this is the
 * only other table in admin-panel using the pattern and pulling in a shared component for two
 * call sites isn't worth it yet. */
function SortableHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-700"
    >
      {label}
      <span className="flex flex-col -space-y-1">
        <CaretIcon direction="up" className={`h-2.5 w-2.5 ${active && dir === 'asc' ? 'text-neutral-700' : 'text-neutral-300'}`} />
        <CaretIcon direction="down" className={`h-2.5 w-2.5 ${active && dir === 'desc' ? 'text-neutral-700' : 'text-neutral-300'}`} />
      </span>
    </button>
  );
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Client half of /activity: search-by-name, sortable columns, and a Show/Hide Columns toggle on
 * top of the server-rendered first page. Sorting is applied client-side to whichever page is
 * currently loaded (same "view concern on top of server pagination" tradeoff CartOverview makes),
 * since re-sorting the whole `customer_activity` table server-side isn't worth a second round trip
 * for a feed that's already ordered newest-first.
 */
export default function ActivityTable({
  initialRows,
  initialTotalCount,
  customerId,
}: {
  initialRows: ActivityRow[];
  initialTotalCount: number;
  customerId?: string;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [sortKey, setSortKey] = useState<ColumnKey>('eventAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>({
    id: true,
    firstName: true,
    lastName: true,
    businessName: true,
    path: true,
    eventAt: true,
  });
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement | null>(null);

  function toggleSort(key: ColumnKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    if (!columnMenuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setColumnMenuOpen(false);
      }
    }
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, [columnMenuOpen]);

  // Same stale-response guard as CartOverview.fetchPage -- a debounced search keystroke can still
  // resolve out of order against a Previous/Next click.
  const latestRequestIdRef = useRef(0);

  async function fetchPage(nextPage: number, nextQuery: string) {
    const requestId = ++latestRequestIdRef.current;
    setIsLoading(true);
    setFetchError('');
    try {
      const response = await getActivityPageAction({ search: nextQuery, page: nextPage, customerId });
      if (requestId !== latestRequestIdRef.current) return;
      if (!response.ok) {
        setFetchError(response.error);
        return;
      }
      setRows(response.result.rows);
      setTotalCount(response.result.totalCount);
    } catch (err) {
      if (requestId !== latestRequestIdRef.current) return;
      console.error('[ActivityTable] fetchPage failed:', err);
      setFetchError('Could not load activity. Please try again.');
    } finally {
      if (requestId === latestRequestIdRef.current) setIsLoading(false);
    }
  }

  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  });

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleQueryChange(value: string) {
    setQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      fetchPageRef.current(1, value);
    }, SEARCH_DEBOUNCE_MS);
  }

  function goToPage(next: number) {
    setPage(next);
    fetchPageRef.current(next, query);
  }

  const dirMul = sortDir === 'asc' ? 1 : -1;
  const sortedRows = [...rows].sort((a, b) => {
    switch (sortKey) {
      case 'id':
        return (a.id - b.id) * dirMul;
      case 'firstName':
        return a.firstName.localeCompare(b.firstName) * dirMul;
      case 'lastName':
        return a.lastName.localeCompare(b.lastName) * dirMul;
      case 'businessName':
        return (a.businessName ?? '').localeCompare(b.businessName ?? '') * dirMul;
      case 'path':
        return a.path.localeCompare(b.path) * dirMul;
      case 'eventAt':
      default:
        return a.eventAt.localeCompare(b.eventAt) * dirMul;
    }
  });

  const pageCount = Math.max(1, Math.ceil(totalCount / ACTIVITY_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        {customerId ? (
          <Link href="/activity" className="text-sm text-purple-700 hover:underline">
            ← Show all customers
          </Link>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search By Name"
            className="w-72 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <div className="relative" ref={columnMenuRef}>
            <button
              type="button"
              onClick={() => setColumnMenuOpen((v) => !v)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Show/Hide Columns
            </button>
            {columnMenuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-neutral-200 bg-white p-2 shadow-lg">
                {COLUMNS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.key]}
                      onChange={() => toggleColumn(col.key)}
                      className="rounded border-neutral-300"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {fetchError}{' '}
          <button type="button" onClick={() => fetchPageRef.current(page, query)} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {totalCount === 0 && query.trim() === '' ? 'No activity yet.' : `No activity matches "${query}".`}
        </div>
      ) : (
        <div className={`overflow-x-auto rounded-lg border border-neutral-200 bg-white transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                {COLUMNS.filter((col) => visibleColumns[col.key]).map((col) => (
                  <th key={col.key} className="px-4 py-2.5 text-left">
                    <SortableHeader label={col.label} active={sortKey === col.key} dir={sortDir} onClick={() => toggleSort(col.key)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {sortedRows.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50 transition-colors">
                  {visibleColumns.id && <td className="px-4 py-2.5 text-neutral-500">{r.id}</td>}
                  {visibleColumns.firstName && <td className="px-4 py-2.5 text-neutral-800">{r.firstName || '—'}</td>}
                  {visibleColumns.lastName && <td className="px-4 py-2.5 text-neutral-800">{r.lastName || '—'}</td>}
                  {visibleColumns.businessName && <td className="px-4 py-2.5 text-neutral-600">{r.businessName ?? '—'}</td>}
                  {visibleColumns.path && (
                    <td className="px-4 py-2.5 font-mono text-xs text-neutral-600">
                      <Link href={`/activity?customer=${encodeURIComponent(r.customerId)}`} className="hover:underline">
                        {r.path}
                      </Link>
                    </td>
                  )}
                  {visibleColumns.eventAt && (
                    <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">
                      {new Date(r.eventAt).toLocaleString('en-CA', { timeZone: 'America/Toronto' })}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalCount > 0 && pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-neutral-500">
            Page {page} of {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(Math.max(1, page - 1))}
              disabled={page <= 1 || isLoading}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => goToPage(Math.min(pageCount, page + 1))}
              disabled={page >= pageCount || isLoading}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
