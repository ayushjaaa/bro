import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { requireAdmin } from './admin-auth';
import { findOrCreateShopifyCustomer } from '@/lib/shopify/customer-lookup';
import { validateCustomerInfoUpdate, type CustomerInfoFields } from '@/lib/customer-info-validation';
import { mapCustomerRow } from '@/lib/customer-row-mapper';

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
  /** Assigned rep (015 migration: sales_reps table + customers.sales_rep_id). Null until the
   * join is added to listCustomers()'s select AND a rep has actually been assigned. */
  salesRepId: string | null;
  salesRep: { name: string; phone: string; email: string } | null;
  /** 'approving' is transient (030 migration): set between an admin claiming a pending row for
   * approval and the Shopify call + finalize completing. 'suspended' (034) is a permanent dead
   * end -- see enforce_customer_status_transition(), it has no outgoing transition at all.
   * 'deactivated' (034) is a temporary, reversible block (deactivated -> approved only). */
  status: 'pending' | 'approving' | 'approved' | 'rejected' | 'suspended' | 'deactivated';
  requestedAt: string;
  /** Used to detect a customer stuck in 'approving' (030 migration escape hatch) -- also bumped
   * by every other status/info change, so it's "last touched", not specific to approval. */
  updatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  /** 034 migration audit trail -- one set of columns per terminal/transitional action, same
   * approvedAt/approvedBy naming convention. rejectionCount lets the drawer show "rejected twice"
   * etc. across reapply cycles. */
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionCount: number;
  suspendedAt: string | null;
  suspendedBy: string | null;
  suspensionReason: string | null;
  deactivatedAt: string | null;
  deactivatedBy: string | null;
  deactivationReason: string | null;
  reactivatedAt: string | null;
  reactivatedBy: string | null;
  shopifyCustomerId: string | null;
  /** Needed to revoke the customer's active Supabase session on suspend/deactivate/reject
   * (034) -- `supabase.auth.admin.signOut(userId)` can only be called from application code,
   * never from SQL, so the RPCs hand this back and the caller does the revoke itself. */
  supabaseUserId: string | null;
  /** Optimistic-locking token for updateCustomerApplicationInfo (031 migration) -- must be sent
   * back unchanged on every info-edit save, or the save is rejected outright. */
  version: number;
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

/** K1: a safety cap, not a redesign -- the Customers screen (item 38's design) intentionally
 * renders every customer in one live table (client-side "All"/"By Rep" toggle, no search/pagination
 * UI exists here today, unlike the /cart page's server-paginated `list_customer_carts`). Almost
 * every column IS genuinely rendered somewhere (the detail drawer shows the full application), so
 * narrowing the `select()` would save little -- the real risk was "no upper bound at all" as the
 * business grows. This caps it generously (well beyond any realistic near-term customer count) so a
 * single page load can never pull an unbounded, ever-growing table into memory; if the real customer
 * count ever approaches this, the right next step is a proper search+pagination UI (same pattern as
 * /cart), not raising the number. */
export const MAX_LISTED_CUSTOMERS = 2000;

/** Lists customers (pending, approved, rejected together), newest request first -- the unified
 * Customers screen (item 38's design) renders all of them in one table, not separate pages. Joins in
 * the assigned sales rep (015-sales-reps-and-notes.sql) -- confirmed live against the database that
 * this migration has been applied before adding the join. */
export async function listCustomers(): Promise<Customer[]> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  // K1: PostgREST's own default max-rows caps a single request at 1000 regardless of a higher
  // `.limit()` (live-verified 2026-09-22, see lib/supabase/paginate.ts) -- must page through in
  // batches to actually reach MAX_LISTED_CUSTOMERS once the real customer count passes 1000.
  const rows: any[] = [];
  for (let offset = 0; offset < MAX_LISTED_CUSTOMERS; offset += 1000) {
    const to = Math.min(offset + 1000, MAX_LISTED_CUSTOMERS) - 1;
    const { data, error } = await supabase
      .from('customers')
      .select('*, sales_reps(name, phone, email)')
      .order('requested_at', { ascending: false })
      .range(offset, to);
    if (error) throw friendlyRpcError(error, 'Could not load customers. Please try again.', 'listCustomers');
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows.map((r) => mapCustomerRow(r));
}

/** Server-side paginated version of listCustomers() -- backs the Customers screen's main table.
 * Flat table, no GROUP BY complexity (unlike cart_snapshot's list_customer_carts RPC), so a plain
 * PostgREST `.range()` + `count: 'exact'` is enough; no RPC needed. Realtime changes are handled
 * by refetching whatever page is currently showing (CustomersTable.tsx), never by merging raw
 * postgres_changes events into a paginated list -- same reasoning as CartOverview.tsx's own
 * paginated cart list (see that component's doc comment). */
export async function listCustomersPage(params: { limit: number; offset: number }): Promise<{
  customers: Customer[];
  totalCount: number;
}> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error, count } = await supabase
    .from('customers')
    .select('*, sales_reps(name, phone, email)', { count: 'exact' })
    .order('requested_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);
  if (error) throw friendlyRpcError(error, 'Could not load customers. Please try again.', 'listCustomersPage');
  return { customers: (data ?? []).map((r) => mapCustomerRow(r)), totalCount: count ?? 0 };
}

/** Backs the "X pending requests awaiting review" header -- independent of whatever page of the
 * main table is currently showing, so it stays accurate no matter which page an admin is on. */
export async function getPendingCustomerCount(): Promise<number> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { count, error } = await supabase.from('customers').select('*', { count: 'exact', head: true }).eq('status', 'pending');
  if (error) throw friendlyRpcError(error, 'Could not load pending count. Please try again.', 'getPendingCustomerCount');
  return count ?? 0;
}

/** Backs the "By Sales Rep" tab only -- that view groups the COMPLETE set of approved accounts (a
 * much smaller, slower-growing set than the full table, since pending/rejected/suspended rows
 * never appear there), so it deliberately stays its own full fetch rather than being paginated --
 * paginating a rep-grouping view would make "how many accounts does this rep have" wrong/partial. */
export async function listApprovedCustomersForRepView(): Promise<Customer[]> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('customers')
    .select('*, sales_reps(name, phone, email)')
    .eq('status', 'approved')
    .order('requested_at', { ascending: false });
  if (error) throw friendlyRpcError(error, 'Could not load approved customers. Please try again.', 'listApprovedCustomersForRepView');
  return (data ?? []).map((r) => mapCustomerRow(r));
}

/** Postgres errcodes our own SECURITY DEFINER functions raise deliberately, with a message
 * already written to be shown to an admin as-is (030/031 migrations). Anything else is an
 * unexpected failure (network blip, an actual bug, a raw Postgres/Shopify error) -- those get
 * logged with full detail server-side but reduced to `fallback` for the UI, never passed through
 * raw (standing checklist: a crash must never reach the admin as a raw/technical error). */
function friendlyRpcError(error: { code?: string; message: string } | null, fallback: string, logLabel: string): Error {
  if (!error) return new Error(fallback);
  if (error.code === 'P0001' || error.code === 'P0002') return new Error(error.message);
  console.error(`[${logLabel}]`, error.code, error.message);
  return new Error(fallback);
}

/**
 * Approves a pending registration in three steps (030 migration -- closes the race where two
 * admins act on the same row concurrently, e.g. approve+approve or approve+reject):
 *
 *  1. CLAIM: atomically flip pending -> approving. If someone else already decided or is
 *     mid-approving this customer, this throws immediately and Shopify is NEVER called.
 *  2. Only the admin who won the claim calls Shopify to find-or-create the Customer.
 *  3. FINALIZE: flip approving -> approved, using the account_type/ship_province the claim
 *     captured (not a fresh read), so a concurrent account-type switch during step 2 can't
 *     corrupt the account-number prefix.
 *
 * If step 2 fails, the claim is reverted back to pending so the applicant is never stuck
 * unreachable in 'approving'; the same revert also runs if step 3 fails (safe either way -- a
 * retry's Shopify step finds the already-created customer instead of duplicating it).
 */
export async function approveCustomer(id: string): Promise<void> {
  const admin = await requireAdmin();
  const supabase = getServiceRoleClient();

  const { data: row, error: fetchError } = await supabase
    .from('customers')
    .select('email, first_name, last_name')
    .eq('id', id)
    .single();
  if (fetchError || !row) throw new Error('Customer not found.');

  const { data: claimRows, error: claimError } = await supabase.rpc('claim_customer_for_approval', { p_id: id });
  if (claimError) throw friendlyRpcError(claimError, 'Could not approve. Please try again.', 'approveCustomer:claim');
  const claim = claimRows?.[0];
  if (!claim) throw new Error('This application was already decided or is being processed.');

  const revertClaim = async () => {
    const { error: revertError } = await supabase.rpc('revert_customer_claim', { p_id: id });
    if (revertError) {
      // Double failure: the thing we were reverting FROM already failed, and now the revert
      // itself failed too. Not something a retry fixes on its own -- flag loudly so it surfaces
      // in monitoring instead of leaving the row silently stuck (standing checklist: cleanup
      // failures must not be swallowed).
      console.error('[approveCustomer:revert] CRITICAL customer stuck in approving:', id, revertError.message);
    }
  };

  let shopifyCustomerId: string;
  try {
    shopifyCustomerId = await findOrCreateShopifyCustomer(row.email, row.first_name, row.last_name);
  } catch (err) {
    await revertClaim();
    console.error('[approveCustomer:shopify]', err);
    throw new Error('Could not reach Shopify. Please try again.');
  }

  const { error: finalizeError } = await supabase.rpc('finalize_customer_approval', {
    p_id: id,
    p_approved_by: admin.email,
    p_shopify_customer_id: shopifyCustomerId,
    p_account_type: claim.account_type,
    p_ship_province: claim.ship_province,
  });
  if (finalizeError) {
    await revertClaim();
    throw friendlyRpcError(finalizeError, 'Could not finish approving this customer. Please try again.', 'approveCustomer:finalize');
  }
}

/** Blocks a customer's Supabase Auth user from signing in or refreshing again (034 migration).
 * NOT `auth.admin.signOut(userId)` -- that doesn't exist for this purpose: GoTrue's `signOut`
 * takes an access-token JWT to invalidate ONE session the caller already holds, not a user id an
 * admin can target (confirmed against the installed @supabase/auth-js: calling it with a user id
 * fails with "invalid JWT: token contains an invalid number of segments", caught live in this
 * project's own Playwright run). The actual supported mechanism is `ban_duration` on
 * `updateUserById` (Supabase's own documented idiom for both a temporary and a "permanent" ban --
 * `'876000h'` is ~100 years, the same value their own docs use). This blocks future sign-in/token
 * refresh; per SuperTokens' "how to ban users" writeup, a short-lived access token already issued
 * before the ban can still work until it naturally expires -- the achievable, industry-normal bar,
 * not an instant kill of every in-flight request. Logged loudly on failure but never thrown -- the
 * DB status change is the authoritative part of suspend/deactivate; a ban-call failure shouldn't
 * make the whole action look like it failed when the row was, in fact, already updated. */
async function setCustomerAuthBan(supabase: ReturnType<typeof getServiceRoleClient>, userId: string | null, banned: boolean, logLabel: string) {
  if (!userId) return;
  const { error } = await supabase.auth.admin.updateUserById(userId, { ban_duration: banned ? '876000h' : 'none' });
  if (error) {
    console.error(`[${logLabel}] could not ${banned ? 'ban' : 'unban'} auth user ${userId}:`, error.message);
  }
}

/** A rejected row is, by construction, never 'approved' (reject_customer only acts on 'pending'
 * rows), and every login path signs a non-approved customer's session back out within the same
 * request (signInWithPassword / auth/callback) -- so a rejected customer can never hold a standing
 * session to revoke in the first place. No ban call here is needed or made. */
export async function rejectCustomer(id: string): Promise<void> {
  const admin = await requireAdmin();
  const supabase = getServiceRoleClient();
  const { error } = await supabase.rpc('reject_customer', { p_id: id, p_rejected_by: admin.email });
  if (error) throw friendlyRpcError(error, 'Could not reject. Please try again.', 'rejectCustomer');
}

/** Permanent -- see 034 migration's enforce_customer_status_transition(): a 'suspended' row has
 * no outgoing transition at all, enforced at the DB level, not just by this UI never offering one.
 * Blocked while 'approving' (half-finished Shopify approval, product decision: let it settle to
 * pending/approved first). Reason is required (mandatory per product decision -- this is
 * undoable, the admin must record why). */
export async function suspendCustomer(id: string, reason: string): Promise<void> {
  const admin = await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc('suspend_customer', {
    p_id: id,
    p_suspended_by: admin.email,
    p_reason: reason,
  });
  if (error) throw friendlyRpcError(error, 'Could not suspend this customer. Please try again.', 'suspendCustomer');
  await setCustomerAuthBan(supabase, data?.[0]?.supabase_user_id ?? null, true, 'suspendCustomer');
}

/** Temporary, reversible (034) -- only from 'approved'. Reason is required for the same audit
 * reasons as suspend, though this one can be undone via reactivateCustomer, which lifts the ban. */
export async function deactivateCustomer(id: string, reason: string): Promise<void> {
  const admin = await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc('deactivate_customer', {
    p_id: id,
    p_deactivated_by: admin.email,
    p_reason: reason,
  });
  if (error) throw friendlyRpcError(error, 'Could not deactivate this customer. Please try again.', 'deactivateCustomer');
  await setCustomerAuthBan(supabase, data?.[0]?.supabase_user_id ?? null, true, 'deactivateCustomer');
}

/** Reverses deactivateCustomer -- only from 'deactivated'. Lifts the auth ban deactivateCustomer
 * put in place, so the customer can sign in again with their existing password immediately. */
export async function reactivateCustomer(id: string): Promise<void> {
  const admin = await requireAdmin();
  const supabase = getServiceRoleClient();
  const { error } = await supabase.rpc('reactivate_customer', { p_id: id, p_reactivated_by: admin.email });
  if (error) throw friendlyRpcError(error, 'Could not reactivate this customer. Please try again.', 'reactivateCustomer');

  const { data: row } = await supabase.from('customers').select('supabase_user_id').eq('id', id).single();
  await setCustomerAuthBan(supabase, row?.supabase_user_id ?? null, false, 'reactivateCustomer');
}

/** Lets a rejected applicant reapply with the SAME email (034, product decision) -- clears the
 * application fields and flips the row back to 'pending' rather than making Reject itself
 * destructive. A separate, explicitly confirmed admin action on purpose: Reject alone must stay
 * the zero-friction, non-destructive action it's always been. */
/** 035: deletes the rejected customer's row (after the RPC snapshots its rejection history +
 * internal notes into rejection_history, see that migration's header) and, here on the JS side,
 * the things only the Admin API / Storage API can touch -- their Auth user and any uploaded
 * licence documents. Without this, signUp() would still fail with `user_already_exists` for the
 * same email even though the customers row is gone -- deleting the row alone isn't enough to
 * actually unblock a fresh registration. Storage sweep mirrors api/internal/delete-applicant's own
 * "belt and braces" sweep, inlined here since admin-panel already holds the service-role client
 * this needs (that endpoint exists for the storefront, which doesn't). */
export async function resetRejectedCustomerForReapply(id: string): Promise<void> {
  const admin = await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc('reset_rejected_customer_for_reapply', { p_id: id, p_reset_by: admin.email });
  if (error) throw friendlyRpcError(error, 'Could not reset this customer for reapplication. Please try again.', 'resetRejectedCustomerForReapply');

  const userId = data?.[0]?.supabase_user_id;
  if (!userId) return;

  try {
    const { data: files } = await supabase.storage.from('registration-documents').list(userId);
    if (files && files.length > 0) {
      await supabase.storage.from('registration-documents').remove(files.map((f) => `${userId}/${f.name}`));
    }
  } catch (err) {
    console.error('[resetRejectedCustomerForReapply] document sweep failed:', err);
  }

  const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    console.error('[resetRejectedCustomerForReapply] could not delete auth user:', deleteUserError.message);
  }
}

/** Manual escape hatch for a customer stuck in 'approving' (e.g. the server crashed mid-approval
 * -- see 030 migration / plan doc for why this is manual rather than an automatic timeout). Only
 * meaningful on a row that's actually stuck; the RPC itself refuses to run on anything else. */
export async function forceResetStuckApproval(id: string): Promise<void> {
  const admin = await requireAdmin();
  const supabase = getServiceRoleClient();
  const { error } = await supabase.rpc('force_reset_stuck_approval', { p_id: id, p_reset_by: admin.email });
  if (error) throw friendlyRpcError(error, 'Could not reset this customer. Please try again.', 'forceResetStuckApproval');
}

/**
 * Edits a customer's application info (business name, address, phone, etc -- NEVER email, which
 * is tied to Supabase Auth, and never anything approval-related, which only moves through the
 * functions above). Optimistic locking (031 migration): `version` must be the value the caller
 * read the row at -- if it's stale (someone else edited in the meantime), the update is rejected
 * with a distinguishable conflict error carrying the current row so the UI can show what changed
 * instead of silently overwriting it. `fields` should contain ONLY the keys the admin actually
 * changed (a partial update, not the whole record).
 */
export async function updateCustomerApplicationInfo(
  id: string,
  version: number,
  fields: CustomerInfoFields
): Promise<{ version: number } | { conflict: true; latest: Customer }> {
  await requireAdmin();
  if (version === undefined || version === null) {
    // Standing checklist / explicit requirement: never proceed without a version -- there would
    // be nothing to check the update against, and the whole guard would silently do nothing.
    throw new Error('Missing version -- refusing to save without a conflict check.');
  }

  const validationError = validateCustomerInfoUpdate(fields);
  if (validationError) throw new Error(validationError);

  const supabase = getServiceRoleClient();
  const { data: newVersion, error } = await supabase.rpc('update_customer_application_info', {
    p_id: id,
    p_version: version,
    p_fields: fields,
  });

  if (error) {
    if (error.code === 'P0002') throw new Error('This customer no longer exists.');
    if (error.code === 'P0001') {
      // Version conflict: fetch the current row so the UI can show what actually changed rather
      // than a bare "conflict" message (Microsoft's documented approach -- current/original/
      // database values, not just an error string).
      const { data: latestRow } = await supabase.from('customers').select('*, sales_reps(name, phone, email)').eq('id', id).single();
      if (latestRow) return { conflict: true, latest: mapCustomerRow(latestRow) };
      throw new Error(error.message);
    }
    console.error('[updateCustomerApplicationInfo]', error.code, error.message);
    throw new Error('Could not save changes. Please try again.');
  }

  return { version: newVersion as number };
}

/** The `registration-documents` bucket is private -- an admin needs a short-lived signed URL to
 * actually view a customer's uploaded licence file (RLS only lets the customer who uploaded it
 * read it directly; service_role bypasses that for review purposes). */
export async function getRegistrationDocumentUrl(path: string): Promise<string> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.storage.from('registration-documents').createSignedUrl(path, 60);
  if (error || !data) {
    console.error('[getRegistrationDocumentUrl]', error?.message);
    throw new Error('Could not generate document URL. Please try again.');
  }
  return data.signedUrl;
}

/** Plain service-role update, not an RPC -- unlike approve_customer (which needs atomic
 * account-number generation), assigning a rep has no special server-side logic to protect, so
 * a direct update through the already-admin-gated service-role client is enough. */
export async function updateCustomerSalesRep(customerId: string, salesRepId: string | null): Promise<void> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { error } = await supabase.from('customers').update({ sales_rep_id: salesRepId }).eq('id', customerId);
  if (error) throw friendlyRpcError(error, 'Could not assign the rep. Please try again.', 'updateCustomerSalesRep');
}

export async function updateAccountType(id: string, accountType: 'retail' | 'wholesale'): Promise<void> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { error } = await supabase.rpc('update_customer_account_type', {
    p_id: id,
    p_account_type: accountType,
  });
  if (error) throw friendlyRpcError(error, 'Could not update account type. Please try again.', 'updateAccountType');
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
  if (error) throw friendlyRpcError(error, 'Could not load cart activity. Please try again.', 'listCartActivity');
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
  if (error) throw friendlyRpcError(error, 'Could not load cart contents. Please try again.', 'listCartSnapshotForCustomers');
  return data ?? [];
}

export type CustomerCartSummary = {
  customerId: string;
  firstName: string;
  lastName: string;
  businessName: string | null;
  email: string;
  accountType: 'retail' | 'wholesale';
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
  if (error) throw friendlyRpcError(error, 'Could not load carts. Please try again.', 'listCustomerCartsPage');
  const rows = data ?? [];
  return {
    customers: rows.map((r: any) => ({
      customerId: r.customer_id,
      firstName: r.first_name,
      lastName: r.last_name,
      businessName: r.business_name,
      email: r.email,
      accountType: r.account_type,
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

/** K1: same safety-cap reasoning as MAX_LISTED_CUSTOMERS above -- this table accumulates faster
 * (one row per order status change, not per customer), so a bit more headroom, but still a bounded
 * cap rather than truly unlimited growth. Newest first, so a cap keeps the most relevant rows. */
export const MAX_ORDER_STATUS_ROWS = 5000;

/** Every logged order/draft-order status change, for the per-customer "which orders, what
 * status" detail view -- raw snake_case shape for the same useLiveTable reason as above. */
export async function listOrderStatusLog(): Promise<OrderStatusRow[]> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  // K1: same PostgREST 1000-row-per-request cap as listCustomers above -- page through in
  // batches to actually reach MAX_ORDER_STATUS_ROWS.
  const rows: OrderStatusRow[] = [];
  for (let offset = 0; offset < MAX_ORDER_STATUS_ROWS; offset += 1000) {
    const to = Math.min(offset + 1000, MAX_ORDER_STATUS_ROWS) - 1;
    const { data, error } = await supabase
      .from('order_status_log')
      .select('*')
      .order('changed_at', { ascending: false })
      .range(offset, to);
    if (error) throw friendlyRpcError(error, 'Could not load order history. Please try again.', 'listOrderStatusLog');
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}
