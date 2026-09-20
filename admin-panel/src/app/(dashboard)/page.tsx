import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { listCategories, listSubcategories, listBrands } from '@/data/taxonomy';
import { listProductLines } from '@/data/products';
import { requireAdmin } from '@/data/admin-auth';
import { checkWebhookHealth } from '@/data/webhook-health';
import DashboardHero from '@/features/dashboard/components/DashboardHero';
import LiveDashboardStats, { type FunnelStage } from '@/features/dashboard/components/LiveDashboardStats';
import CatalogStatCards from '@/features/dashboard/components/CatalogStatCards';
import AttentionAndPublishedRate from '@/features/dashboard/components/AttentionAndPublishedRate';
import ProductHealthPanel, {
  type ProductHealthRow,
  type VariantSkuRow,
} from '@/features/dashboard/components/ProductHealthPanel';
import RecentlyUpdatedCard from '@/features/dashboard/components/RecentlyUpdatedCard';
import WebhookHealthBadge from '@/features/dashboard/components/WebhookHealthBadge';
import ConversionFunnel from '@/features/dashboard/components/ConversionFunnel';
import IncompleteProductLinesCard from '@/features/dashboard/components/IncompleteProductLinesCard';
import MissingRetailPriceCard from '@/features/dashboard/components/MissingRetailPriceCard';
import { getFunnelStats } from '@/data/funnel';
import { buildAttentionData } from '@/features/dashboard/lib/attention';
import { ScrollReveal } from '@/components/ScrollReveal';

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

  const { initialInventoryRows, attentionLookup } = buildAttentionData(products);
  const missingRetailPrice = products
    .filter((p) => p.missingRetailPriceVariants.length > 0)
    .map((p) => ({ id: p.id, title: p.title, missingCount: p.missingRetailPriceVariants.length }));

  const funnelStages: FunnelStage[] = [
    { label: 'Categories', value: categories.length, colorVar: '--dash-funnel-1' },
    { label: 'Sub-categories', value: subcategories.length, colorVar: '--dash-funnel-2' },
    { label: 'Brands', value: brands.length, colorVar: '--dash-funnel-3' },
    { label: 'Product Lines', value: products.length, colorVar: '--dash-funnel-4' },
    { label: 'Flavours', value: totalFlavours, colorVar: '--dash-funnel-5' },
  ];

  return (
    // Warm page background scoped to this page's own wrapper (not the shared (dashboard)
    // layout), matching the approved Admin Dashboard.dc.html mockup -- other not-yet-redesigned
    // pages (Customers, Cart, Products) keep the default background until their own pass.
    // No horizontal/top padding here -- DashboardHero needs to bleed edge-to-edge across the
    // full page width (matching the mockup's full-bleed gradient), so padding is applied only
    // to the content wrapper below it, not this outer shell.
    <div className="-m-6 min-h-full bg-dash-page-bg pb-6">
      <DashboardHero adminEmail={admin.email} initialInventoryRows={initialInventoryRows} />

      <div className="max-w-7xl mx-auto px-4 flex flex-col gap-5">
        {/* Overview + Conversion Funnel/2x2 stat cards -- pulled up together as ONE block to
           overlap the hero's bottom edge, so the hero's gradient shows through the grid gaps
           between cards (matching the reference exactly, where both rows sit on the hero, not
           just the first one). */}
        <div className="-mt-16 flex flex-col gap-5">
          <LiveDashboardStats
            funnelStages={funnelStages}
            publishedCount={publishedCount}
            publishableCount={publishable.length}
          />

          {/* Conversion Funnel | 2x2 stat cards -- matches the mockup's second grid row
             (Conversion Funnel | 2x2 category cards), same left-wider/right-narrower ratio. */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-stretch">
            <div className="lg:col-span-3">
              <ConversionFunnel stats={funnelStats} />
            </div>
            <div className="lg:col-span-2">
              <CatalogStatCards
                initialInventoryRows={initialInventoryRows}
                attentionLookup={attentionLookup}
                incomplete={incomplete.map((p) => ({ id: p.id, title: p.title }))}
                unpublished={unpublished.map((p) => ({ id: p.id, title: p.title, variantCount: p.variantCount }))}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end mb-3">
          <WebhookHealthBadge initial={webhookHealth} />
        </div>

        {/* Below here is off-screen on load for most viewports -- each section fades up once as
           the admin scrolls to it (ScrollReveal), rather than everything animating at once on
           mount. Kept to section-level wrapping only (not per-card/per-row) so it reads as the
           page settling in, not a distracting cascade. */}
        <ScrollReveal>
          {/* Stock | Ready to Publish | Published Rate -- "things needing admin action right
             now," grouped in one area instead of Ready-to-Publish sitting in its own card
             further down the page. */}
          <AttentionAndPublishedRate
            initialInventoryRows={initialInventoryRows}
            attentionLookup={attentionLookup}
            publishedCount={publishedCount}
            publishableCount={publishable.length}
            unpublished={unpublished.map((p) => ({ id: p.id, title: p.title, variantCount: p.variantCount }))}
          />
        </ScrollReveal>

        <ScrollReveal>
          <RecentlyUpdatedCard initialProductHealth={(productHealthRows ?? []) as ProductHealthRow[]} />
        </ScrollReveal>

        {/* Everything below here is domain-specific content the mockup doesn't cover --
           kept after the mockup-matched sections rather than interleaved with them. */}
        <ScrollReveal>
          <ProductHealthPanel
            initialProductHealth={(productHealthRows ?? []) as ProductHealthRow[]}
            initialSkuIndex={(skuIndexRows ?? []) as VariantSkuRow[]}
            allBrands={brands.map((b) => ({ id: b.id, name: b.name }))}
            allSubcategories={subcategories.map((s) => ({ id: s.id, name: s.name }))}
          />
        </ScrollReveal>

        <ScrollReveal>
          <IncompleteProductLinesCard incomplete={incomplete.map((p) => ({ id: p.id, title: p.title }))} />
        </ScrollReveal>

        <ScrollReveal>
          <MissingRetailPriceCard products={missingRetailPrice} />
        </ScrollReveal>
      </div>
    </div>
  );
}
