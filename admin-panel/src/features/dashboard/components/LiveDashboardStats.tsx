'use client';

import Link from 'next/link';
import { useLiveInventoryTable, type InventorySnapshotRow } from '../hooks/useLiveInventoryTable';

const LOW_STOCK_THRESHOLD = 10;

export type AttentionItem = {
  inventoryItemId: string;
  productId: string;
  productTitle: string;
  flavourTitle: string;
  imageUrl: string | null;
};

export type FunnelStage = { label: string; value: number; colorVar: string };

export default function LiveDashboardStats({
  adminEmail,
  initialInventoryRows,
  attentionLookup,
  funnelStages,
  publishedCount,
  publishableCount,
  incomplete,
  unpublished,
}: {
  adminEmail: string;
  initialInventoryRows: InventorySnapshotRow[];
  attentionLookup: AttentionItem[];
  funnelStages: FunnelStage[];
  publishedCount: number;
  publishableCount: number;
  incomplete: { id: string; title: string }[];
  unpublished: { id: string; title: string; variantCount: number }[];
}) {
  const liveQuantities = useLiveInventoryTable(initialInventoryRows);

  const totalStock = [...liveQuantities.values()].reduce((sum, q) => sum + q, 0);
  const outOfStock = attentionLookup.filter((a) => (liveQuantities.get(a.inventoryItemId) ?? 0) === 0);
  const lowStock = attentionLookup.filter((a) => {
    const q = liveQuantities.get(a.inventoryItemId) ?? 0;
    return q > 0 && q < LOW_STOCK_THRESHOLD;
  });
  const publishedRate = publishableCount === 0 ? 0 : Math.round((publishedCount / publishableCount) * 100);

  const maxFunnelValue = Math.max(1, ...funnelStages.map((s) => s.value));

  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <div
        className="rounded-2xl p-6 text-white flex items-center justify-between gap-6 flex-wrap"
        style={{ background: 'linear-gradient(135deg, var(--dash-hero-from), var(--dash-hero-to))' }}
      >
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm text-white/70">Track your store's stock, catalog health, and sales readiness</p>
            <h1 className="text-2xl font-semibold mt-0.5">Welcome back, {adminEmail.split('@')[0]}!</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/products/new"
              className="rounded-full bg-white text-neutral-900 text-sm font-medium px-4 py-2 hover:bg-white/90"
            >
              + Add Product
            </Link>
            <Link
              href="/products"
              className="rounded-full bg-white/15 text-white text-sm font-medium px-4 py-2 hover:bg-white/25 border border-white/30"
            >
              View Products
            </Link>
          </div>
        </div>
        <div className="rounded-xl bg-white/10 border border-white/20 px-6 py-4 min-w-[220px]">
          <div className="flex items-center gap-1.5 text-xs text-white/70">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            Live
          </div>
          <div className="text-3xl font-semibold mt-1">{totalStock.toLocaleString('en-CA')}</div>
          <div className="text-xs text-white/70 mt-0.5">Total Stock across every Flavour</div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="Out of Stock"
          value={outOfStock.length}
          tone={outOfStock.length > 0 ? 'danger' : 'success'}
          sub={outOfStock.length > 0 ? `${outOfStock.length} Flavour${outOfStock.length === 1 ? '' : 's'}` : 'All stocked'}
        />
        <StatTile
          label="Low Stock"
          value={lowStock.length}
          tone={lowStock.length > 0 ? 'warning' : 'success'}
          sub={`below ${LOW_STOCK_THRESHOLD} units`}
        />
        <StatTile
          label="Incomplete Product Lines"
          value={incomplete.length}
          tone={incomplete.length > 0 ? 'warning' : 'success'}
          sub="0 Flavours added"
        />
        <StatTile
          label="Ready, Not Published"
          value={unpublished.length}
          tone={unpublished.length > 0 ? 'info' : 'success'}
          sub="waiting to go live"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Funnel */}
        <div className="lg:col-span-2 rounded-xl border border-dash-card-border bg-dash-card-bg p-5">
          <h2 className="text-sm font-semibold text-neutral-700 mb-4">Catalog Funnel</h2>
          <div className="flex flex-col gap-3">
            {funnelStages.map((stage) => (
              <div key={stage.label} className="flex items-center gap-3">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: `var(${stage.colorVar})` }}
                />
                <span className="text-xs text-neutral-500 w-28 shrink-0">{stage.label}</span>
                <div className="flex-1 h-2.5 rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(stage.value / maxFunnelValue) * 100}%`,
                      backgroundColor: `var(${stage.colorVar})`,
                    }}
                  />
                </div>
                <span className="text-sm font-semibold text-neutral-800 w-10 text-right shrink-0">{stage.value}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-dash-text-muted mt-4">
            Refreshes on page load — becomes fully live once the product-metadata webhook (planned) is built.
          </p>
        </div>

        {/* Published rate ring */}
        <div className="rounded-xl border border-dash-card-border bg-dash-card-bg p-5 flex flex-col items-center justify-center">
          <h2 className="text-sm font-semibold text-neutral-700 self-start mb-2">Published Rate</h2>
          <PublishedRing percent={publishedRate} />
          <p className="text-xs text-dash-text-muted mt-2 text-center">
            {publishedCount} of {publishableCount} sellable Product Lines are live
          </p>
        </div>
      </div>

      {/* Needs Attention list */}
      {(outOfStock.length > 0 || lowStock.length > 0) && (
        <div className="rounded-xl border border-dash-card-border bg-dash-card-bg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-700">⚠ Needs Attention — Stock</span>
            <span className="text-xs text-dash-text-muted">{outOfStock.length + lowStock.length}</span>
          </div>
          <ul>
            {[...outOfStock, ...lowStock].slice(0, 8).map((item) => {
              const qty = liveQuantities.get(item.inventoryItemId) ?? 0;
              const numericId = item.productId.split('/').pop();
              return (
                <li key={item.inventoryItemId} className="border-b border-neutral-50 last:border-0">
                  <Link
                    href={`/products/${numericId}/edit-flavours`}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-neutral-50"
                  >
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="w-8 h-8 rounded object-cover border border-neutral-200" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-neutral-100 border border-neutral-200" />
                    )}
                    <div className="flex-1">
                      <div className="text-neutral-800 font-medium">{item.productTitle}</div>
                      <div className="text-xs text-dash-text-muted">{item.flavourTitle}</div>
                    </div>
                    <span
                      className={`text-xs font-semibold ${qty === 0 ? 'text-dash-danger' : 'text-dash-warning'}`}
                    >
                      {qty} in stock
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: 'danger' | 'warning' | 'success' | 'info';
}) {
  const toneClass = {
    danger: 'text-dash-danger',
    warning: 'text-dash-warning',
    success: 'text-dash-success',
    info: 'text-dash-info',
  }[tone];

  return (
    <div className="rounded-xl border border-dash-card-border bg-dash-card-bg p-4">
      <div className="text-xs text-dash-text-muted">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</div>
      <div className="text-[11px] text-dash-text-muted mt-0.5">{sub}</div>
    </div>
  );
}

function PublishedRing({ percent }: { percent: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width="110" height="110" viewBox="0 0 110 110">
      <circle cx="55" cy="55" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="10" />
      <circle
        cx="55"
        cy="55"
        r={radius}
        fill="none"
        stroke="var(--dash-info)"
        strokeWidth="10"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 55 55)"
      />
      <text x="55" y="60" textAnchor="middle" fontSize="20" fontWeight="600" fill="#171717">
        {percent}%
      </text>
    </svg>
  );
}
