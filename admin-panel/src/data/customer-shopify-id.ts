import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';

/** Service Role client — bypasses RLS. Never expose to the client; only used here. */
function getServiceRoleClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Resolves this app's own Supabase `customers.id` to the Shopify Customer GID
 * (`customers.shopify_customer_id`) written once at approval time (see `approveCustomer()` in
 * `data/customers.ts`, via `findOrCreateShopifyCustomer()`). Returns `null` if the row doesn't
 * exist or the column is somehow unset -- should not happen for an approved customer, since the
 * same request that flips a row to `approved` also resolves this value, but this must never throw
 * for that case, just report it, so callers can decide what "no linked Shopify customer yet"
 * means for their own flow (e.g. a Draft Order still gets created without `purchasingEntity`
 * rather than blocking a purchase, and an order-history lookup just returns an empty list).
 *
 * Deliberately does NOT call `requireAdmin()`, unlike every other function in `data/customers.ts`
 * -- this is called from internal-secret-gated API routes (storefront-to-admin-panel calls), which
 * have no admin session at all, same reasoning as `create-draft-order/route.ts`'s own doc comment
 * ("No requireAdmin() here deliberately... The shared secret IS the trust boundary"). Kept in its
 * own file rather than exported from `data/customers.ts` (whose every other export assumes an
 * admin session) so that distinction is visible at the file level, not just in one comment.
 */
export async function getShopifyCustomerIdForCustomer(customerId: string): Promise<string | null> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('customers')
    .select('shopify_customer_id')
    .eq('id', customerId)
    .maybeSingle();
  if (error || !data) return null;
  return data.shopify_customer_id;
}
