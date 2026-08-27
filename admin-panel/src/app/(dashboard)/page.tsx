import Link from 'next/link';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { listCategories, listSubcategories, listBrands } from '@/data/taxonomy';
import { listProductLines } from '@/data/products';
import { requireAdmin } from '@/data/admin-auth';
import { checkWebhookHealth } from '@/data/webhook-health';
import LiveDashboardStats, {
  type AttentionItem,
  type FunnelStage,
} from '@/features/dashboard/components/LiveDashboardStats';
import ProductHealthPanel, {
  type ProductHealthRow,
  type VariantSkuRow,
} from '@/features/dashboard/components/ProductHealthPanel';
import WebhookHealthBadge from '@/features/dashboard/components/WebhookHealthBadge';
import ConversionFunnel from '@/features/dashboard/components/ConversionFunnel';
import { getFunnelStats } from '@/data/funnel';

function getReadOnlyClient() {
  // Both tables allow public SELECT via RLS (see 003/004 migrations) -- service role is used here
  // purely for convenience in a Server Component, not because the data is sensitive.
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function OverviewPage() {
  const [admin, categories, subcategories, brands, products, webhookHealth, funnelStats] = await Promise.all([
    requireAdmin(),
    listCategories(),
    listSubcategories(),
    listBrands(),
    listProductLines(),
    checkWebhookHealth(),
    getFunnelStats(),
  ]);

  const supabase = getReadOnlyClient();
  const [{ data: productHealthRows }, { data: skuIndexRows }] = await Promise.all([
    supabase.from('product_health_snapshot').select('*'),
    supabase.from('variant_sku_index').select('*'),
  ]);

  const totalFlavours = products.reduce((sum, p) => sum + p.variantCount, 0);
  const incomplete = products.filter((p) => p.variantCount === 0);
  const unpublished = products.filter((p) => p.variantCount > 0 && !p.isPublished);
  const publishable = products.filter((p) => p.variantCount > 0);
  const publishedCount = publishable.filter((p) => p.isPublished).length;

  const initialInventoryRows = products.flatMap((p) =>
    p.variantStock
      .filter((v): v is { inventoryItemId: string; quantity: number; title: string } => !!v.inventoryItemId)
      .map((v) => ({ inventory_item_id: v.inventoryItemId, quantity: v.quantity }))
  );

  const attentionLookup: AttentionItem[] = products.flatMap((p) =>
    p.variantStock
      .filter((v): v is { inventoryItemId: string; quantity: number; title: string } => !!v.inventoryItemId)
      .map((v) => ({
        inventoryItemId: v.inventoryItemId,
        productId: p.id,
        productTitle: p.title,
        flavourTitle: v.title,
        imageUrl: p.imageUrl,
      }))
  );

  const funnelStages: FunnelStage[] = [
    { label: 'Categories', value: categories.length, colorVar: '--dash-funnel-1' },
    { label: 'Sub-categories', value: subcategories.length, colorVar: '--dash-funnel-2' },
    { label: 'Brands', value: brands.length, colorVar: '--dash-funnel-3' },
    { label: 'Product Lines', value: products.length, colorVar: '--dash-funnel-4' },
    { label: 'Flavours', value: totalFlavours, colorVar: '--dash-funnel-5' },
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 flex flex-col gap-5">
      <div className="flex justify-end">
        <WebhookHealthBadge initial={webhookHealth} />
      </div>

      <LiveDashboardStats
        adminEmail={admin.email}
        initialInventoryRows={initialInventoryRows}
        attentionLookup={attentionLookup}
        funnelStages={funnelStages}
        publishedCount={publishedCount}
        publishableCount={publishable.length}
        incomplete={incomplete.map((p) => ({ id: p.id, title: p.title }))}
        unpublished={unpublished.map((p) => ({ id: p.id, title: p.title, variantCount: p.variantCount }))}
      />

      <ProductHealthPanel
        initialProductHealth={(productHealthRows ?? []) as ProductHealthRow[]}
        initialSkuIndex={(skuIndexRows ?? []) as VariantSkuRow[]}
        allBrands={brands.map((b) => ({ id: b.id, name: b.name }))}
        allSubcategories={subcategories.map((s) => ({ id: s.id, name: s.name }))}
      />

      <ConversionFunnel stats={funnelStats} />

      {/* Incomplete Product Lines -- 0 flavours, not sellable yet (§0a) */}
      <div className="rounded-xl border border-dash-card-border bg-dash-card-bg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
          <span className="text-sm font-medium text-neutral-700">
            ⚠ Incomplete Product Lines — 0 flavours
          </span>
          <span className="text-xs text-dash-text-muted">{incomplete.length}</span>
        </div>
        {incomplete.length === 0 ? (
          <p className="px-4 py-6 text-sm text-dash-text-muted text-center">
            None — every Product Line has at least one Flavour.
          </p>
        ) : (
          <ul>
            {incomplete.map((p) => {
              const numericId = p.id.split('/').pop();
              return (
                <li key={p.id} className="border-b border-neutral-50 last:border-0">
                  <Link
                    href={`/products/${numericId}/variants`}
                    className="flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-50"
                  >
                    <span className="font-medium text-neutral-800">{p.title}</span>
                    <span className="text-dash-warning text-xs font-medium">+ Add Flavours</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Ready-but-not-live Product Lines -- has flavours, never published (§0a fact 5) */}
      {unpublished.length > 0 && (
        <div className="rounded-xl border border-dash-card-border bg-dash-card-bg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-700">○ Ready but not published</span>
            <span className="text-xs text-dash-text-muted">{unpublished.length}</span>
          </div>
          <ul>
            {unpublished.map((p) => {
              const numericId = p.id.split('/').pop();
              return (
                <li key={p.id} className="border-b border-neutral-50 last:border-0">
                  <Link
                    href={`/products/${numericId}`}
                    className="flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-50"
                  >
                    <span className="font-medium text-neutral-800">{p.title}</span>
                    <span className="text-dash-text-muted text-xs">
                      {p.variantCount} flavour{p.variantCount === 1 ? '' : 's'} — view to publish
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
