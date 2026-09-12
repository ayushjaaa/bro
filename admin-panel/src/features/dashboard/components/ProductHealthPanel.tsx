'use client';

import { useLiveTable } from '../hooks/useLiveTable';
import { DashCard } from './DashCard';
import { ImageIcon, HashIcon, WarningIcon, FilterIcon, ClockIcon, LayersIcon } from '@/components/icons';

const STALE_DRAFT_DAYS = 14; // default; change here if the business wants a different cutoff

export type ProductHealthRow = {
  product_id: string;
  title: string;
  status: string;
  has_image: boolean;
  variant_count: number;
  missing_sku_count: number;
  has_price_anomaly: boolean;
  brand_id: string | null;
  brand_name: string | null;
  subcategory_id: string | null;
  subcategory_name: string | null;
  missing_required_filter: boolean;
  created_at: string;
  published_at: string | null;
  updated_at: string;
};

export type VariantSkuRow = {
  variant_id: string;
  product_id: string;
  sku: string;
};

export default function ProductHealthPanel({
  initialProductHealth,
  initialSkuIndex,
  allBrands,
  allSubcategories,
}: {
  initialProductHealth: ProductHealthRow[];
  initialSkuIndex: VariantSkuRow[];
  allBrands: { id: string; name: string }[];
  allSubcategories: { id: string; name: string }[];
}) {
  const products = [...useLiveTable('product_health_snapshot', 'product_id', initialProductHealth).values()];
  const skus = [...useLiveTable('variant_sku_index', 'variant_id', initialSkuIndex).values()];

  if (products.length === 0) {
    return (
      <DashCard className="p-5 text-sm text-dash-text-muted">
        No catalog health data yet — this fills in once products are created/edited (or after
        running <code className="text-xs">npm run shopify:backfill-product-health-snapshot</code>).
      </DashCard>
    );
  }

  const statusCounts = { ACTIVE: 0, DRAFT: 0, ARCHIVED: 0 } as Record<string, number>;
  for (const p of products) statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;

  const missingImage = products.filter((p) => !p.has_image);
  const missingSku = products.filter((p) => p.missing_sku_count > 0);
  const priceAnomaly = products.filter((p) => p.has_price_anomaly);
  const missingRequiredFilter = products.filter((p) => p.missing_required_filter);

  const staleCutoff = Date.now() - STALE_DRAFT_DAYS * 24 * 60 * 60 * 1000;
  const staleDrafts = products.filter(
    (p) => p.status === 'DRAFT' && !p.published_at && new Date(p.created_at).getTime() < staleCutoff
  );

  const skuCounts = new Map<string, number>();
  for (const s of skus) skuCounts.set(s.sku, (skuCounts.get(s.sku) ?? 0) + 1);
  const duplicateSkus = [...skuCounts.entries()].filter(([, count]) => count > 1);

  const usedBrandIds = new Set(products.map((p) => p.brand_id).filter(Boolean));
  const usedSubcategoryIds = new Set(products.map((p) => p.subcategory_id).filter(Boolean));
  const emptyBrands = allBrands.filter((b) => !usedBrandIds.has(b.id));
  const emptySubcategories = allSubcategories.filter((s) => !usedSubcategoryIds.has(s.id));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat icon={ImageIcon} label="Missing Image" value={missingImage.length} />
        <MiniStat icon={HashIcon} label="Missing SKU" value={missingSku.length} />
        <MiniStat icon={WarningIcon} label="Price Anomalies" value={priceAnomaly.length} />
        <MiniStat icon={HashIcon} label="Duplicate SKUs" value={duplicateSkus.length} />
        <MiniStat icon={FilterIcon} label="Missing Required Filter" value={missingRequiredFilter.length} />
        <MiniStat
          icon={ClockIcon}
          label="Stale Drafts"
          value={staleDrafts.length}
          statusLabel={staleDrafts.length > 0 ? `${STALE_DRAFT_DAYS}+ days` : undefined}
        />
        <MiniStat icon={LayersIcon} label="Empty Brands" value={emptyBrands.length} />
        <MiniStat icon={LayersIcon} label="Empty Sub-categories" value={emptySubcategories.length} />
      </div>

      <DashCard className="p-5">
        <h2 className="text-sm font-bold text-dash-text-ink mb-3">Status Breakdown</h2>
        <div className="flex flex-col gap-2">
          {(['ACTIVE', 'DRAFT', 'ARCHIVED'] as const).map((status) => (
            <div key={status} className="flex items-center gap-3">
              <span className="text-xs text-dash-text-muted w-20 shrink-0">{status}</span>
              <div className="flex-1 h-2.5 rounded-full bg-neutral-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-dash-info"
                  style={{ width: `${(statusCounts[status] / products.length) * 100}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-dash-text-ink w-8 text-right">{statusCounts[status]}</span>
            </div>
          ))}
        </div>
      </DashCard>
    </div>
  );
}

/** Same icon-chip -> label -> number -> status-pill skeleton as `StatTile` in
 * LiveDashboardStats.tsx, applied identically here (Uniform Connectedness/Similarity)
 * rather than a slightly-different secondary-tile treatment. */
function MiniStat({
  icon: Icon,
  label,
  value,
  statusLabel,
}: {
  icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  label: string;
  value: number;
  statusLabel?: string;
}) {
  const tone = value > 0 ? 'warning' : 'success';
  const toneClass = tone === 'warning' ? 'text-dash-warning' : 'text-dash-success';
  const chipBgClass = tone === 'warning' ? 'bg-dash-warning/10' : 'bg-dash-success/10';
  const pillClass =
    tone === 'warning'
      ? 'bg-dash-pill-warning-bg text-dash-pill-warning-text'
      : 'bg-dash-pill-success-bg text-dash-pill-success-text';

  return (
    <DashCard className="p-4">
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold text-dash-text-muted">{label}</span>
        <div className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${chipBgClass}`}>
          <Icon className={`size-3.5 ${toneClass}`} />
        </div>
      </div>
      <div className={`text-xl font-extrabold mt-2.5 ${toneClass}`}>{value}</div>
      <span className={`inline-block mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${pillClass}`}>
        {statusLabel ?? (value > 0 ? `${value} found` : 'All clear')}
      </span>
    </DashCard>
  );
}
