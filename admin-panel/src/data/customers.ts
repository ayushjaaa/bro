import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { requireAdmin } from './admin-auth';
import { findOrCreateShopifyCustomer } from '@/lib/shopify/customer-lookup';

/** Service Role client — bypasses RLS. Never expose to the client; only used here. */
function getServiceRoleClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type Customer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  businessName: string | null;
  businessRegistrationNumber: string | null;
  pstNumber: string | null;
  vptNumber: string | null;
  typeOfBusiness: string | null;
  licenseNumber: string | null;
  accountType: 'retail' | 'wholesale';
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  shopifyCustomerId: string | null;
};

function toCustomer(row: any): Customer {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    businessName: row.business_name,
    businessRegistrationNumber: row.business_registration_number,
    pstNumber: row.pst_number,
    vptNumber: row.vpt_number,
    typeOfBusiness: row.type_of_business,
    licenseNumber: row.license_number,
    accountType: row.account_type,
    status: row.status,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    shopifyCustomerId: row.shopify_customer_id,
  };
}

/** Lists every customer (pending, approved, rejected together) -- the unified Customers screen
 * (item 38's design) renders all of them in one table, not separate pages. */
export async function listCustomers(): Promise<Customer[]> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('requested_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toCustomer);
}

/** Approves a pending registration: finds-or-creates the matching Shopify Customer, then flips
 * the row to approved with that Shopify id attached (item 22 step 4). */
export async function approveCustomer(id: string): Promise<void> {
  const admin = await requireAdmin();
  const supabase = getServiceRoleClient();

  const { data: row, error: fetchError } = await supabase
    .from('customers')
    .select('email, first_name, last_name')
    .eq('id', id)
    .single();
  if (fetchError || !row) throw new Error(fetchError?.message ?? 'Customer not found');

  const shopifyCustomerId = await findOrCreateShopifyCustomer(row.email, row.first_name, row.last_name);

  const { error } = await supabase.rpc('approve_customer', {
    p_id: id,
    p_approved_by: admin.email,
    p_shopify_customer_id: shopifyCustomerId,
  });
  if (error) throw new Error(error.message);
}

export async function rejectCustomer(id: string): Promise<void> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { error } = await supabase.rpc('reject_customer', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function updateAccountType(id: string, accountType: 'retail' | 'wholesale'): Promise<void> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { error } = await supabase.rpc('update_customer_account_type', {
    p_id: id,
    p_account_type: accountType,
  });
  if (error) throw new Error(error.message);
}

export type CartEvent = {
  id: string;
  customerId: string | null;
  productId: string | null;
  action: string;
  quantity: number | null;
  eventAt: string;
};

/** Cart Activity list -- self-reported by the storefront (see cart_events table comment). */
export async function listCartActivity(): Promise<CartEvent[]> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('cart_events')
    .select('*')
    .order('event_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    customerId: r.customer_id,
    productId: r.product_id,
    action: r.action,
    quantity: r.quantity,
    eventAt: r.event_at,
  }));
}

export type CartSnapshotRow = {
  customer_id: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  updated_at: string;
};

/** Current cart contents for every customer (see cart_snapshot table comment -- this always
 * reflects "what's in the cart RIGHT NOW", unlike cart_events' append-only history). Raw snake_case
 * shape returned as-is since it's consumed directly by useLiveTable, which needs to match
 * Realtime's own payload shape. */
export async function listCartSnapshot(): Promise<CartSnapshotRow[]> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from('cart_snapshot').select('*');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type OrderStatusRow = {
  id: string;
  customer_id: string | null;
  order_id: string;
  old_status: string | null;
  new_status: string;
  changed_at: string;
};

/** Every logged order/draft-order status change, for the per-customer "which orders, what
 * status" detail view -- raw snake_case shape for the same useLiveTable reason as above. */
export async function listOrderStatusLog(): Promise<OrderStatusRow[]> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('order_status_log')
    .select('*')
    .order('changed_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
