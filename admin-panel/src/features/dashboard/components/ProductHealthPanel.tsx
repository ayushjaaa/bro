'use client';

import Link from 'next/link';
import { useLiveTable } from '../hooks/useLiveTable';

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
      <div className="rounded-xl border border-dash-card-border bg-dash-card-bg p-5 text-sm text-dash-text-muted">
        No catalog health data yet — this fills in once products are created/edited (or after
        running <code className="text-xs">npm run shopify:backfill-product-health-snapshot</code>).
      </div>
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

  const recentlyUpdated = [...products].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Missing Image" value={missingImage.length} />
        <MiniStat label="Missing SKU" value={missingSku.length} />
        <MiniStat label="Price Anomalies" value={priceAnomaly.length} />
        <MiniStat label="Duplicate SKUs" value={duplicateSkus.length} />
        <MiniStat label="Missing Required Filter" value={missingRequiredFilter.length} />
        <MiniStat label="Stale Drafts" value={staleDrafts.length} sub={`${STALE_DRAFT_DAYS}+ days`} />
        <MiniStat label="Empty Brands" value={emptyBrands.length} />
        <MiniStat label="Empty Sub-categories" value={emptySubcategories.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-dash-card-border bg-dash-card-bg p-5">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">Status Breakdown</h2>
          <div className="flex flex-col gap-2">
            {(['ACTIVE', 'DRAFT', 'ARCHIVED'] as const).map((status) => (
              <div key={status} className="flex items-center gap-3">
                <span className="text-xs text-neutral-500 w-20 shrink-0">{status}</span>
                <div className="flex-1 h-2.5 rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-dash-info"
                    style={{ width: `${(statusCounts[status] / products.length) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-neutral-800 w-8 text-right">{statusCounts[status]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-dash-card-border bg-dash-card-bg overflow-hidden">
          <h2 className="text-sm font-semibold text-neutral-700 px-5 pt-5 pb-2">Recently Updated</h2>
          <ul>
            {recentlyUpdated.map((p) => {
              const numericId = p.product_id.split('/').pop();
              return (
                <li key={p.product_id} className="border-t border-neutral-50">
                  <Link href={`/products/${numericId}`} className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-neutral-50">
                    <div>
                      <span className="text-neutral-800">{p.title}</span>
                      <span
                        className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          p.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : p.status === 'DRAFT'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <span className="text-xs text-dash-text-muted">{p.variant_count} Flavours</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-dash-card-border bg-dash-card-bg p-4">
      <div className="text-xs text-dash-text-muted">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${value > 0 ? 'text-dash-warning' : 'text-dash-success'}`}>{value}</div>
      {sub && <div className="text-[11px] text-dash-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
