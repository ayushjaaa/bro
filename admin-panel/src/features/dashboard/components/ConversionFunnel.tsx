import type { FunnelStats } from '@/data/funnel';
import { DashCard, DashCardHeader } from './DashCard';
import { WarningIcon } from '@/components/icons';

const STAGES: {
  key: keyof Pick<
    FunnelStats,
    'registered' | 'approved' | 'firstLogin' | 'addedToCart' | 'orderRequestSubmitted' | 'orderConfirmed'
  >;
  label: string;
  colorVar: string;
}[] = [
  { key: 'registered', label: 'Registered', colorVar: '--dash-funnel-1' },
  { key: 'approved', label: 'Approved', colorVar: '--dash-funnel-2' },
  { key: 'firstLogin', label: 'First Login', colorVar: '--dash-funnel-3' },
  { key: 'addedToCart', label: 'Added to Cart', colorVar: '--dash-funnel-4' },
  { key: 'orderRequestSubmitted', label: 'Requested', colorVar: '--dash-funnel-5' },
  { key: 'orderConfirmed', label: 'Confirmed', colorVar: '--dash-funnel-6' },
];

/** Trapezoid clip-path for one funnel segment, same technique as Admin Dashboard.dc.html --
 * `value`/`nextValue` set each side's width (as a fraction of the funnel's max value, floored
 * so a segment never fully vanishes), giving the classic narrowing funnel silhouette purely
 * from real stage counts, no decorative fabrication. */
function segmentClipPath(value: number, nextValue: number, maxValue: number): string {
  const floor = 0.16;
  const frac = (v: number) => Math.max(floor, maxValue > 0 ? v / maxValue : floor);
  const a = ((1 - frac(value)) / 2) * 100;
  const b = ((1 - frac(nextValue)) / 2) * 100;
  return `polygon(0% ${a}%, 100% ${b}%, 100% ${100 - b}%, 0% ${100 - a}%)`;
}

/** Server Component (not live) -- these events are driven by customer registration/login/order
 * activity, which is naturally infrequent compared to inventory changes; a page-load-fresh view
 * is appropriate here, consistent with how the rest of the Customers section behaves today. */
export default function ConversionFunnel({ stats }: { stats: FunnelStats }) {
  const maxValue = Math.max(1, stats.registered);
  const overallRate = stats.registered > 0 ? Math.round((stats.orderConfirmed / stats.registered) * 100) : 0;

  // Biggest leak: the single stage-to-stage transition with the largest real user-count drop.
  // Computed purely from FunnelStats, no fabricated cause/reason attached.
  let biggestLeak: { from: string; to: string; drop: number; fromValue: number; pct: number } | null = null;
  for (let i = 1; i < STAGES.length; i++) {
    const prevValue = stats[STAGES[i - 1].key];
    const value = stats[STAGES[i].key];
    const drop = prevValue - value;
    if (drop > 0 && (!biggestLeak || drop > biggestLeak.drop)) {
      biggestLeak = {
        from: STAGES[i - 1].label,
        to: STAGES[i].label,
        drop,
        fromValue: prevValue,
        pct: prevValue > 0 ? Math.round((drop / prevValue) * 100) : 0,
      };
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DashCard className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-dash-text-ink">Conversion Funnel</h2>
        </div>
        <div className="mt-3 flex items-baseline gap-2.5 flex-wrap">
          <span className="text-dash-text-ink font-extrabold tracking-tight text-3xl">
            {overallRate}
            <span className="text-dash-text-muted">%</span>
          </span>
          <span className="text-xs font-medium text-dash-text-muted">
            {stats.registered} registered → {stats.orderConfirmed} confirmed
          </span>
        </div>

        <div className="mt-4 grid grid-cols-6 gap-0.5 h-28">
          {STAGES.map((stage, i) => {
            const value = stats[stage.key];
            const nextValue = i < STAGES.length - 1 ? stats[STAGES[i + 1].key] : value;
            return (
              <div key={stage.key} className="relative h-full overflow-hidden">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundColor: `var(${stage.colorVar})`,
                    clipPath: segmentClipPath(value, nextValue, maxValue),
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-6 gap-0.5 mt-2.5">
          {STAGES.map((stage, i) => {
            const value = stats[stage.key];
            const prevValue = i === 0 ? null : stats[STAGES[i - 1].key];
            const rate = prevValue && prevValue > 0 ? Math.round((value / prevValue) * 100) : null;
            return (
              <div key={stage.key} className="px-0.5 flex flex-col gap-0.5">
                <span className="text-[9.5px] font-semibold text-dash-text-caption leading-tight">{stage.label}</span>
                <span className="flex items-baseline gap-1">
                  <span className="text-sm font-extrabold text-dash-text-ink leading-none">{value}</span>
                  {rate !== null && <span className="text-[9px] font-bold text-dash-text-muted">{rate}%</span>}
                </span>
              </div>
            );
          })}
        </div>

        {biggestLeak && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-dash-pill-warning-bg border border-dash-pill-warning-text/20 px-3 py-2.5">
            <WarningIcon className="size-4.5 shrink-0 text-dash-pill-warning-text" />
            <span className="text-xs font-semibold text-dash-pill-warning-text">
              Biggest leak: {biggestLeak.from} → {biggestLeak.to} drops {biggestLeak.drop} of {biggestLeak.fromValue} users (
              {biggestLeak.pct}%)
            </span>
          </div>
        )}
      </DashCard>

      {(stats.stuckApprovedNoLogin.length > 0 || stats.stuckOrderNotConfirmed.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.stuckApprovedNoLogin.length > 0 && (
            <DashCard overflowHidden>
              <DashCardHeader
                title={
                  <span className="flex items-center gap-1.5">
                    <WarningIcon className="size-4 text-dash-warning" />
                    Approved, never logged in
                  </span>
                }
                count={stats.stuckApprovedNoLogin.length}
              />
              <ul>
                {stats.stuckApprovedNoLogin.slice(0, 8).map((c) => (
                  <li key={c.id} className="border-b border-dash-divider last:border-0 px-4 py-2.5 text-sm flex items-center justify-between">
                    <span className="text-dash-text-ink">{c.name}</span>
                    <span className="text-xs text-dash-text-muted">approved {new Date(c.approvedAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </DashCard>
          )}
          {stats.stuckOrderNotConfirmed.length > 0 && (
            <DashCard overflowHidden>
              <DashCardHeader
                title={
                  <span className="flex items-center gap-1.5">
                    <WarningIcon className="size-4 text-dash-warning" />
                    Order request stalled
                  </span>
                }
                count={stats.stuckOrderNotConfirmed.length}
              />
              <ul>
                {stats.stuckOrderNotConfirmed.slice(0, 8).map((o) => (
                  <li key={o.orderId} className="border-b border-dash-divider last:border-0 px-4 py-2.5 text-sm flex items-center justify-between">
                    <span className="text-dash-text-ink text-xs">{o.orderId.split('/').pop()}</span>
                    <span className="text-xs text-dash-text-muted">since {new Date(o.changedAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </DashCard>
          )}
        </div>
      )}
    </div>
  );
}
