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
  personalCell: string | null;
  businessName: string | null;
  businessRegistrationNumber: string | null;
  pstNumber: string | null;
  vptNumber: string | null;
  typeOfBusiness: string | null;
  licenseNumber: string | null;
  accountType: 'retail' | 'wholesale';
  /** Assigned only at approval (014 migration), never at signup -- format "<W|R>-<PROVINCE>-<YY>-<SEQ>",
   * e.g. "W-ON-26-0142". Null for pending/rejected customers, since they never became a real account. */
  accountNumber: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  shopifyCustomerId: string | null;
  // Fields collected by the storefront's real registration wizard (008 migration) --
  // undocumented/unused by the older 005-era fields above, which stay for any pre-existing rows.
  legalBusinessName: string | null;
  operatingName: string | null;
  businessNumber: string | null;
  numStores: number | null;
  businessTypes: string[] | null;
  monthlyPurchaseRange: string | null;
  sellsOnline: boolean | null;
  onlineUrl: string | null;
  instagramHandle: string | null;
  shipLine1: string | null;
  shipLine2: string | null;
  shipCity: string | null;
  shipProvince: string | null;
  shipPostalCode: string | null;
  billSameAsShipping: boolean | null;
  billLine1: string | null;
  billLine2: string | null;
  billCity: string | null;
  billProvince: string | null;
  billPostalCode: string | null;
  businessLicencePath: string | null;
  specialtyLicencePath: string | null;
  taxExempt: boolean | null;
  referralSource: string | null;
  signatureName: string | null;
  signedAt: string | null;
};

function toCustomer(row: any): Customer {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    personalCell: row.personal_cell,
    businessName: row.business_name,
    businessRegistrationNumber: row.business_registration_number,
    pstNumber: row.pst_number,
    vptNumber: row.vpt_number,
    typeOfBusiness: row.type_of_business,
    licenseNumber: row.license_number,
    accountType: row.account_type,
    accountNumber: row.account_number,
    status: row.status,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    shopifyCustomerId: row.shopify_customer_id,
    legalBusinessName: row.legal_business_name,
    operatingName: row.operating_name,
    businessNumber: row.business_number,
    numStores: row.num_stores,
    businessTypes: row.business_types,
    monthlyPurchaseRange: row.monthly_purchase_range,
    sellsOnline: row.sells_online,
    onlineUrl: row.online_url,
    instagramHandle: row.instagram_handle,
    shipLine1: row.ship_line1,
    shipLine2: row.ship_line2,
    shipCity: row.ship_city,
    shipProvince: row.ship_province,
    shipPostalCode: row.ship_postal_code,
    billSameAsShipping: row.bill_same_as_shipping,
    billLine1: row.bill_line1,
    billLine2: row.bill_line2,
    billCity: row.bill_city,
    billProvince: row.bill_province,
    billPostalCode: row.bill_postal_code,
    businessLicencePath: row.business_licence_path,
    specialtyLicencePath: row.specialty_licence_path,
    taxExempt: row.tax_exempt,
    referralSource: row.referral_source,
    signatureName: row.signature_name,
    signedAt: row.signed_at,
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

/** The `registration-documents` bucket is private -- an admin needs a short-lived signed URL to
 * actually view a customer's uploaded licence file (RLS only lets the customer who uploaded it
 * read it directly; service_role bypasses that for review purposes). */
export async function getRegistrationDocumentUrl(path: string): Promise<string> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.storage.from('registration-documents').createSignedUrl(path, 60);
  if (error || !data) throw new Error(error?.message ?? 'Could not generate document URL');
  return data.signedUrl;
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

/** Cart contents for a specific set of customers -- used to hydrate the item lines for whichever
 * page of customers `listCustomerCartsPage()` returned (and, since a customer can only be opened
 * in the detail modal from a row already on screen, that's also all the modal ever needs). Never
 * called with an unbounded id list -- callers are expected to pass a page's worth of ids, not
 * every customer with a cart. */
export async function listCartSnapshotForCustomers(customerIds: string[]): Promise<CartSnapshotRow[]> {
  await requireAdmin();
  if (customerIds.length === 0) return [];
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from('cart_snapshot').select('*').in('customer_id', customerIds);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type CustomerCartSummary = {
  customerId: string;
  firstName: string;
  lastName: string;
  businessName: string | null;
  email: string;
  itemCount: number;
  lastUpdated: string;
};

export type CustomerCartsPage = {
  customers: CustomerCartSummary[];
  totalCount: number;
  totalItems: number;
};

/** Server-side paginated "which customers have items in their cart right now, most recently
 * active first" -- backed by the `list_customer_carts` Postgres function (see
 * 012-cart-snapshot-pagination.sql for why this can't be a plain LIMIT/OFFSET on cart_snapshot
 * itself: it's grouped by customer and ordered by each customer's latest item, both of which need
 * every one of that customer's rows to compute). `search` matches name/business/email, same as
 * this page's search box did when filtering client-side. */
export async function listCustomerCartsPage(params: {
  search?: string;
  limit: number;
  offset: number;
}): Promise<CustomerCartsPage> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc('list_customer_carts', {
    p_search: params.search?.trim() || null,
    p_limit: params.limit,
    p_offset: params.offset,
  });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    customers: rows.map((r: any) => ({
      customerId: r.customer_id,
      firstName: r.first_name,
      lastName: r.last_name,
      businessName: r.business_name,
      email: r.email,
      itemCount: Number(r.item_count),
      lastUpdated: r.last_updated,
    })),
    totalCount: rows.length > 0 ? Number(rows[0].total_count) : 0,
    totalItems: rows.length > 0 ? Number(rows[0].total_items) : 0,
  };
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
