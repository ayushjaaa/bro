import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';

export interface OrderingCustomer {
  email: string;
  accountType: 'retail' | 'wholesale';
  shopifyCustomerId: string | null;
}

/**
 * The customer an order may be placed for: must exist AND be approved. Everything identity-related
 * in a draft order (email, price tier, Shopify customer) is taken from this row, not from the
 * request body -- the internal endpoint's shared secret proves the caller is our storefront, not
 * that the customer id / email in the body belong together. Returns null for "no such customer" or
 * "not approved"; throws only on a database failure (callers must fail closed).
 */
export async function getApprovedCustomerForOrder(customerId: string): Promise<OrderingCustomer | null> {
  const supabase = createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data, error } = await supabase
    .from('customers')
    .select('email, account_type, shopify_customer_id, status')
    .eq('id', customerId)
    .maybeSingle();
  if (error) throw new Error(`customer lookup failed: ${error.message}`);
  if (!data || data.status !== 'approved') return null;
  return { email: data.email, accountType: data.account_type, shopifyCustomerId: data.shopify_customer_id };
}
