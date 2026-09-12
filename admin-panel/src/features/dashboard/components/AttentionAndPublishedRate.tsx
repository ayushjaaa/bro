'use client';

import Link from 'next/link';
import { useLiveInventoryTable, type InventorySnapshotRow } from '../hooks/useLiveInventoryTable';
import { DashCard } from './DashCard';
import { WarningIcon, PulseDotIcon, EmptyCircleIcon } from '@/components/icons';
import type { AttentionItem } from './LiveDashboardStats';

const LOW_STOCK_THRESHOLD = 10;

type UnpublishedProduct = { id: string; title: string; variantCount: number };

/**
 * Mirrors the mockup's "Recent Transactions | Investment Performance" row -- a wider slot
 * beside a narrower headline-number card. The wide slot is now split into two cards sitting
 * side by side, each sharing half its width: Stock attention | Ready to Publish -- both are
 * "things needing admin action right now," so they sit next to each other instead of one
 * being buried in its own card further down the page.
 */
export default function AttentionAndPublishedRate({
  initialInventoryRows,
  attentionLookup,
  publishedCount,
  publishableCount,
  unpublished,
}: {
  initialInventoryRows: InventorySnapshotRow[];
  attentionLookup: AttentionItem[];
  publishedCount: number;
  publishableCount: number;
  unpublished: UnpublishedProduct[];
}) {
  const liveQuantities = useLiveInventoryTable(initialInventoryRows);
  const outOfStock = attentionLookup.filter((a) => (liveQuantities.get(a.inventoryItemId) ?? 0) === 0);
  const lowStock = attentionLookup.filter((a) => {
    const q = liveQuantities.get(a.inventoryItemId) ?? 0;
    return q > 0 && q < LOW_STOCK_THRESHOLD;
  });
  const publishedRate = publishableCount === 0 ? 0 : Math.round((publishedCount / publishableCount) * 100);
  const rateTone = publishedRate >= 75 ? 'success' : publishedRate >= 40 ? 'warning' : 'danger';
  const rateToneClass = {
    success: 'text-dash-success',
    warning: 'text-dash-warning',
    danger: 'text-dash-danger',
  }[rateTone];
  const ratePillClass = {
    success: 'bg-dash-pill-success-bg text-dash-pill-success-text',
    warning: 'bg-dash-pill-warning-bg text-dash-pill-warning-text',
    danger: 'bg-dash-pill-danger-bg text-dash-pill-danger-text',
  }[rateTone];
  const rateRingColor = { success: 'var(--dash-success)', warning: 'var(--dash-warning)', danger: 'var(--dash-danger)' }[
    rateTone
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
      <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Stock attention */}
        {outOfStock.length > 0 || lowStock.length > 0 ? (
          <DashCard overflowHidden>
            <div className="px-4 pt-4 pb-1 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-[13px] font-bold text-dash-text-ink">
                <WarningIcon className="size-4 text-dash-warning" />
                Stock
              </div>
              <Link href="/products/attention" className="text-xs font-semibold text-dash-text-link hover:underline">
                View all
              </Link>
            </div>
            <div className="px-4 pb-3 flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-extrabold text-dash-text-ink">{outOfStock.length + lowStock.length}</span>
              <span className="text-[11px] font-medium text-dash-text-muted">
                {outOfStock.length} out · {lowStock.length} low
              </span>
            </div>
            <ul className="border-t border-dash-divider">
              {[...outOfStock, ...lowStock].slice(0, 4).map((item) => {
                const qty = liveQuantities.get(item.inventoryItemId) ?? 0;
                const numericId = item.productId.split('/').pop();
                const isOut = qty === 0;
                return (
                  <li key={item.inventoryItemId} className="border-b border-dash-divider last:border-0">
                    <Link
                      href={`/products/${numericId}/edit-flavours`}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-neutral-50"
                    >
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover border border-neutral-200" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-neutral-100 border border-neutral-200" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-dash-text-ink font-medium text-[13px] truncate">{item.productTitle}</div>
                        <div className="text-[11px] text-dash-text-muted truncate">{item.flavourTitle}</div>
                      </div>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-bold whitespace-nowrap ${
                          isOut ? 'bg-dash-pill-danger-bg text-dash-pill-danger-text' : 'bg-dash-pill-warning-bg text-dash-pill-warning-text'
                        }`}
                      >
                        {qty}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </DashCard>
        ) : (
          <DashCard className="p-4 flex items-center justify-center text-sm text-dash-text-muted">
            Every Flavour is stocked.
          </DashCard>
        )}

        {/* Ready to Publish */}
        {unpublished.length > 0 ? (
          <DashCard overflowHidden>
            <div className="px-4 pt-4 pb-1 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-[13px] font-bold text-dash-text-ink">
                <EmptyCircleIcon className="size-4 text-dash-info" />
                Ready to Publish
              </div>
            </div>
            <div className="px-4 pb-3 flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-extrabold text-dash-text-ink">{unpublished.length}</span>
              <span className="text-[11px] font-medium text-dash-text-muted">Product Lines waiting</span>
            </div>
            <ul className="border-t border-dash-divider">
              {unpublished.slice(0, 4).map((p) => {
                const numericId = p.id.split('/').pop();
                return (
                  <li key={p.id} className="border-b border-dash-divider last:border-0">
                    <Link
                      href={`/products/${numericId}`}
                      className="flex items-center justify-between gap-2.5 px-4 py-2 text-sm hover:bg-neutral-50"
                    >
                      <span className="text-dash-text-ink font-medium text-[13px] truncate">{p.title}</span>
                      <span className="text-[10.5px] font-bold text-dash-info whitespace-nowrap">
                        {p.variantCount} flavour{p.variantCount === 1 ? '' : 's'}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {unpublished.length > 4 && (
              <Link
                href="/products"
                className="block px-4 py-2 text-xs font-semibold text-dash-text-link hover:underline border-t border-dash-divider"
              >
                View all {unpublished.length} →
              </Link>
            )}
          </DashCard>
        ) : (
          <DashCard className="p-4 flex items-center justify-center text-sm text-dash-text-muted">
            Nothing waiting to publish.
          </DashCard>
        )}
      </div>

      {/* Published Rate -- headline percentage leads (Overview-card skeleton), the ring is a
         compact supporting visual underneath, not the card's own focal point. */}
      <DashCard className="p-5 h-full flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-dash-text-ink">Published Rate</h2>
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <PulseDotIcon className="size-2" />
            Live
          </span>
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`text-3xl font-extrabold ${rateToneClass}`}>{publishedRate}%</span>
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${ratePillClass}`}>
            {rateTone === 'success' ? 'On track' : rateTone === 'warning' ? 'Needs push' : 'Behind'}
          </span>
        </div>
        <p className="text-xs text-dash-text-muted mb-3">
          {publishedCount} of {publishableCount} sellable Product Lines are live
        </p>
        <div className="flex-1 flex items-center justify-center">
          <PublishedRing percent={publishedRate} size={72} strokeWidth={8} color={rateRingColor} />
        </div>
      </DashCard>
    </div>
  );
}

function PublishedRing({
  percent,
  size = 110,
  strokeWidth = 10,
  color = 'var(--dash-info)',
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--dash-ring-track)" strokeWidth={strokeWidth} />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}
