import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';

/** Service Role client -- bypasses RLS. Never expose to the client; only used here. */
function getServiceRoleClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Resolves this app's own Supabase `customers.id` to that customer's `account_type`
 * ('retail' | 'wholesale') -- the checkout trust boundary for the dual-pricing feature.
 * `createDraftOrder()` calls this itself, server-side, rather than trusting any account_type the
 * storefront might send, since price correctness (what a customer is actually charged) must never
 * depend on client-supplied data.
 *
 * Deliberately does NOT call `requireAdmin()`, same reasoning as
 * `getShopifyCustomerIdForCustomer()` (data/customer-shopify-id.ts) which this mirrors exactly --
 * called from internal-secret-gated API routes (storefront-to-admin-panel calls) with no admin
 * session at all; the shared secret IS the trust boundary. Returns `null` on any lookup failure so
 * the caller can apply a safe default (wholesale/native price -- see draft-orders.ts) rather than
 * blocking order creation over a transient Supabase hiccup.
 */
export async function getAccountTypeForCustomer(
  customerId: string
): Promise<'retail' | 'wholesale' | null> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('customers')
    .select('account_type')
    .eq('id', customerId)
    .maybeSingle();
  if (error || !data) return null;
  return data.account_type;
}
