'use client';

import Link from 'next/link';
import { useLiveInventoryTable, type InventorySnapshotRow } from '../hooks/useLiveInventoryTable';
import { DashCard } from './DashCard';
import { BoxIcon, LayersIcon, CheckIcon, CaretIcon } from '@/components/icons';
import type { AttentionItem } from './LiveDashboardStats';

const LOW_STOCK_THRESHOLD = 10;

/**
 * The mockup's 2x2 "category" stat-card grid, sitting beside Conversion Funnel in one grid
 * row (see page.tsx) rather than as its own full-width row -- matches
 * Admin Dashboard.dc.html's `grid-template-columns: repeat(2, minmax(0,1fr))` placed in the
 * narrower of the two top-level grid columns.
 */
export default function CatalogStatCards({
  initialInventoryRows,
  attentionLookup,
  incomplete,
  unpublished,
}: {
  initialInventoryRows: InventorySnapshotRow[];
  attentionLookup: AttentionItem[];
  incomplete: { id: string; title: string }[];
  unpublished: { id: string; title: string; variantCount: number }[];
}) {
  const liveQuantities = useLiveInventoryTable(initialInventoryRows);
  const outOfStock = attentionLookup.filter((a) => (liveQuantities.get(a.inventoryItemId) ?? 0) === 0);
  const lowStock = attentionLookup.filter((a) => {
    const q = liveQuantities.get(a.inventoryItemId) ?? 0;
    return q > 0 && q < LOW_STOCK_THRESHOLD;
  });

  return (
    <div className="grid grid-cols-2 gap-3 h-full">
      <StatTile
        index={0}
        icon={BoxIcon}
        label="Out of Stock"
        value={outOfStock.length}
        tone={outOfStock.length > 0 ? 'danger' : 'success'}
        statusLabel={
          outOfStock.length > 0 ? `${outOfStock.length} Flavour${outOfStock.length === 1 ? '' : 's'}` : 'All stocked'
        }
        href={outOfStock.length > 0 ? '/products/attention' : undefined}
      />
      <StatTile
        index={1}
        icon={BoxIcon}
        label="Low Stock"
        value={lowStock.length}
        tone={lowStock.length > 0 ? 'warning' : 'success'}
        statusLabel={lowStock.length > 0 ? `below ${LOW_STOCK_THRESHOLD} units` : 'All stocked'}
        href={lowStock.length > 0 ? '/products/attention' : undefined}
      />
      <StatTile
        index={2}
        icon={LayersIcon}
        label="Incomplete Lines"
        value={incomplete.length}
        tone={incomplete.length > 0 ? 'warning' : 'success'}
        statusLabel={incomplete.length > 0 ? '0 Flavours added' : 'All complete'}
      />
      <StatTile
        index={3}
        icon={CheckIcon}
        label="Not Published"
        value={unpublished.length}
        tone={unpublished.length > 0 ? 'info' : 'success'}
        statusLabel={unpublished.length > 0 ? 'waiting to go live' : 'All published'}
      />
    </div>
  );
}

/** Mirrors Admin Dashboard.dc.html's category card exactly: label in ink (not muted) top-left,
 * a small bordered glyph box top-right (mockup's `24x24, border 1px, color:#8a7f76`), the big
 * number always in ink (mockup never tints the number by status), and a small colored status
 * line below in the mockup's exact caption shape (colored keyword + muted trailing text) --
 * real status here (not a fabricated "from last month" delta), same visual slot/weight. */
function StatTile({
  index,
  icon: Icon,
  label,
  value,
  statusLabel,
  tone,
  href,
}: {
  /** Position in the 2x2 grid (0-3) -- staggers this tile's entrance slightly behind the last,
   * same card-by-card reveal pattern as the Overview tiles above it. */
  index: number;
  icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  label: string;
  value: number;
  statusLabel: string;
  tone: 'danger' | 'warning' | 'success' | 'info';
  /** When set, the tile links to the full detail page for that stat (e.g. Out of Stock / Low
   * Stock -> /products/attention) instead of just being a static number. */
  href?: string;
}) {
  const entranceStyle = { animationDelay: `${index * 0.08}s` };
  const toneClass = {
    danger: 'text-dash-danger',
    warning: 'text-dash-warning',
    success: 'text-dash-success',
    info: 'text-dash-info',
  }[tone];

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-bold text-dash-text-ink leading-tight">{label}</span>
        <div className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-dash-card-border">
          <Icon className="size-3.5 text-dash-text-link" strokeWidth={1.2} />
        </div>
      </div>
      <div
        className="flex items-baseline text-dash-text-ink font-extrabold tracking-[-0.02em] leading-none mt-8"
        style={{ fontSize: 'clamp(26px, 2.6vw, 34px)' }}
      >
        {value}
      </div>
      <div className="mt-2 flex items-center gap-1 flex-wrap">
        {/* Caret direction reflects the real current count -- up when there's something to
           flag (value > 0), down when resolved -- not a claimed period-over-period trend. */}
        <CaretIcon direction={value > 0 ? 'up' : 'down'} className={`size-2.5 shrink-0 ${toneClass}`} />
        {(() => {
          const match = statusLabel.match(/^(\d+)(.*)$/);
          return match ? (
            <span className="text-[10.5px]">
              <span className={`font-bold ${toneClass}`}>{match[1]}</span>
              <span className="font-medium text-dash-text-muted">{match[2]}</span>
            </span>
          ) : (
            <span className="text-[10.5px] font-medium text-dash-text-muted">{statusLabel}</span>
          );
        })()}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full opacity-0 animate-[dash-fade-up_0.45s_ease-out_forwards]" style={entranceStyle}>
        <DashCard className="px-4 pb-4 pt-8 h-full hover:shadow-md transition-shadow">{content}</DashCard>
      </Link>
    );
  }

  return (
    <div className="h-full opacity-0 animate-[dash-fade-up_0.45s_ease-out_forwards]" style={entranceStyle}>
      <DashCard className="px-4 pb-4 pt-8 h-full">{content}</DashCard>
    </div>
  );
}
