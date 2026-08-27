import type { FunnelStats } from '@/data/funnel';

const STAGES: {
  key: keyof Pick<
    FunnelStats,
    'registered' | 'approved' | 'firstLogin' | 'addedToCart' | 'orderRequestSubmitted' | 'orderConfirmed'
  >;
  label: string;
}[] = [
  { key: 'registered', label: 'Registered' },
  { key: 'approved', label: 'Approved' },
  { key: 'firstLogin', label: 'First Login' },
  { key: 'addedToCart', label: 'Added to Cart' },
  { key: 'orderRequestSubmitted', label: 'Order Request Submitted' },
  { key: 'orderConfirmed', label: 'Order Confirmed' },
];

/** Server Component (not live) -- these events are driven by customer registration/login/order
 * activity, which is naturally infrequent compared to inventory changes; a page-load-fresh view
 * is appropriate here, consistent with how the rest of the Customers section behaves today. */
export default function ConversionFunnel({ stats }: { stats: FunnelStats }) {
  const maxValue = Math.max(1, stats.registered);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-dash-card-border bg-dash-card-bg p-5">
        <h2 className="text-sm font-semibold text-neutral-700 mb-4">Conversion Funnel</h2>
        <div className="flex flex-col gap-3">
          {STAGES.map((stage, i) => {
            const value = stats[stage.key];
            const prevValue = i === 0 ? null : stats[STAGES[i - 1].key];
            const conversionPct = prevValue ? Math.round((value / prevValue) * 100) : null;
            return (
              <div key={stage.key} className="flex items-center gap-3">
                <span className="text-xs text-neutral-500 w-48 shrink-0">{stage.label}</span>
                <div className="flex-1 h-2.5 rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-dash-info"
                    style={{ width: `${(value / maxValue) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-neutral-800 w-10 text-right shrink-0">{value}</span>
                <span className="text-xs text-dash-text-muted w-12 text-right shrink-0">
                  {conversionPct !== null ? `${conversionPct}%` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {(stats.stuckApprovedNoLogin.length > 0 || stats.stuckOrderNotConfirmed.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.stuckApprovedNoLogin.length > 0 && (
            <div className="rounded-xl border border-dash-card-border bg-dash-card-bg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-700">⚠ Approved, never logged in</span>
                <span className="text-xs text-dash-text-muted">{stats.stuckApprovedNoLogin.length}</span>
              </div>
              <ul>
                {stats.stuckApprovedNoLogin.slice(0, 8).map((c) => (
                  <li key={c.id} className="border-b border-neutral-50 last:border-0 px-4 py-2.5 text-sm flex items-center justify-between">
                    <span className="text-neutral-800">{c.name}</span>
                    <span className="text-xs text-dash-text-muted">approved {new Date(c.approvedAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {stats.stuckOrderNotConfirmed.length > 0 && (
            <div className="rounded-xl border border-dash-card-border bg-dash-card-bg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-700">⚠ Order request stalled</span>
                <span className="text-xs text-dash-text-muted">{stats.stuckOrderNotConfirmed.length}</span>
              </div>
              <ul>
                {stats.stuckOrderNotConfirmed.slice(0, 8).map((o) => (
                  <li key={o.orderId} className="border-b border-neutral-50 last:border-0 px-4 py-2.5 text-sm flex items-center justify-between">
                    <span className="text-neutral-800 text-xs">{o.orderId.split('/').pop()}</span>
                    <span className="text-xs text-dash-text-muted">since {new Date(o.changedAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
