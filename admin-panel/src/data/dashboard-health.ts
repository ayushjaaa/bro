import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { requireAdmin } from './admin-auth';
import { fetchAllRows } from '@/lib/supabase/paginate';
import type { ProductHealthRow, VariantSkuRow } from '@/features/dashboard/components/ProductHealthPanel';

/** K2: this used to be built and queried directly inside `(dashboard)/page.tsx` -- both tables
 * allow public SELECT via RLS (see 003/004 migrations), so a service-role client here isn't a new
 * exposure, but every other admin data-access lives in `data/*.ts` with its own `requireAdmin()`
 * gate and a cap on unbounded reads, and this was the one exception. */
function getServiceRoleClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** One row per Product Line -- generous but bounded so this can't grow forever unnoticed as the
 * catalog does. See `lib/supabase/paginate.ts` for why this needs real `.range()` pagination, not
 * just `.limit()`, to actually be reached. */
export const MAX_PRODUCT_HEALTH_ROWS = 5000;
/** One row per Flavour (variant) -- a Product Line can have many, so this cap is higher than the
 * product-level one above. */
export const MAX_VARIANT_SKU_ROWS = 20000;

export async function getDashboardHealthSnapshots(): Promise<{
  productHealthRows: ProductHealthRow[];
  skuIndexRows: VariantSkuRow[];
}> {
  await requireAdmin();
  const supabase = getServiceRoleClient();

  const [productHealthRows, skuIndexRows] = await Promise.all([
    fetchAllRows<ProductHealthRow>(
      (from, to) => supabase.from('product_health_snapshot').select('*').range(from, to),
      MAX_PRODUCT_HEALTH_ROWS
    ),
    fetchAllRows<VariantSkuRow>(
      (from, to) => supabase.from('variant_sku_index').select('*').range(from, to),
      MAX_VARIANT_SKU_ROWS
    ),
  ]);

  return { productHealthRows, skuIndexRows };
}
