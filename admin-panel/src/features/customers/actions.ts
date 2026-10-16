'use server';

import { revalidatePath } from 'next/cache';
import {
  approveCustomer,
  rejectCustomer,
  suspendCustomer,
  deactivateCustomer,
  reactivateCustomer,
  resetRejectedCustomerForReapply,
  updateAccountType,
  updateCustomerSalesRep,
  updateCustomerApplicationInfo,
  forceResetStuckApproval,
  listCustomersPage,
  listApprovedCustomersForRepView,
  getRegistrationDocumentUrl,
  listCustomerCartsPage,
  listCartSnapshotForCustomers,
  type Customer,
  type CustomerCartsPage,
  type CartSnapshotRow,
} from '@/data/customers';
import type { CustomerInfoFields } from '@/lib/customer-info-validation';
import { getProductTitlesByIds, getVariantDetailsByIds, type VariantDetail } from '@/data/products';
import { listSalesReps, createSalesRep, type SalesRep } from '@/data/sales-reps';
import { listNotes, createNote, listNoteCountsFor, type NoteEntityType, type InternalNote } from '@/data/internal-notes';
import { safeActionError } from '@/lib/action-errors';

export async function approveCustomerAction(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  await approveCustomer(id);
  revalidatePath('/customers');
}

export async function rejectCustomerAction(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  await rejectCustomer(id);
  revalidatePath('/customers');
}

/** Permanent, no undo path (034) -- reason is mandatory. */
export async function suspendCustomerAction(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const reason = String(formData.get('reason') ?? '');
  await suspendCustomer(id, reason);
  revalidatePath('/customers');
}

/** Temporary, reversible via reactivateCustomerAction (034) -- reason is mandatory. */
export async function deactivateCustomerAction(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const reason = String(formData.get('reason') ?? '');
  await deactivateCustomer(id, reason);
  revalidatePath('/customers');
}

export async function reactivateCustomerAction(id: string) {
  await reactivateCustomer(id);
  revalidatePath('/customers');
}

/** Lets a rejected applicant reapply with the same email (034) -- separate from Reject itself. */
export async function resetRejectedCustomerForReapplyAction(id: string) {
  await resetRejectedCustomerForReapply(id);
  revalidatePath('/customers');
}

export async function updateAccountTypeAction(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const accountType = formData.get('accountType') === 'wholesale' ? 'wholesale' : 'retail';
  await updateAccountType(id, accountType);
  revalidatePath('/customers');
}

export async function getRegistrationDocumentUrlAction(path: string): Promise<string> {
  return getRegistrationDocumentUrl(path);
}

export async function listSalesRepsAction(): Promise<SalesRep[]> {
  return listSalesReps();
}

export async function createSalesRepAction(input: {
  name: string;
  phone: string;
  email: string;
}): Promise<{ ok: true; rep: SalesRep } | { ok: false; error: string }> {
  try {
    const rep = await createSalesRep(input);
    return { ok: true, rep };
  } catch (error) {
    return { ok: false, error: safeActionError(error, 'Failed to create sales rep. Please try again.', 'sales-reps:create') };
  }
}

export async function updateCustomerSalesRepAction(customerId: string, salesRepId: string | null) {
  await updateCustomerSalesRep(customerId, salesRepId);
  revalidatePath('/customers');
}

/** Manual escape hatch for a customer stuck in 'approving' (030 migration / plan doc). */
export async function forceResetStuckApprovalAction(id: string) {
  await forceResetStuckApproval(id);
  revalidatePath('/customers');
}

/** Part 2 (031 migration): edits a customer's application info under optimistic locking.
 * Returns the conflict shape as-is (not a thrown error) so the client can show the
 * conflict-resolution flow instead of a generic failure -- see updateCustomerApplicationInfo's
 * own doc comment for why. */
export async function updateCustomerApplicationInfoAction(
  id: string,
  version: number,
  fields: CustomerInfoFields
): Promise<{ ok: true; version: number } | { ok: false; conflict: true; latest: Customer } | { ok: false; error: string }> {
  try {
    const result = await updateCustomerApplicationInfo(id, version, fields);
    revalidatePath('/customers');
    if ('conflict' in result) return { ok: false, conflict: true, latest: result.latest };
    return { ok: true, version: result.version };
  } catch (error) {
    // updateCustomerApplicationInfo already sanitizes every error it throws into an
    // admin-safe message (same convention as approveCustomer/rejectCustomer -- see their own
    // action wrappers above, which likewise pass the error straight through to the client).
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save changes. Please try again.' };
  }
}

/** Backs the Customers screen's paginated main table -- both the initial page-change/Next-Previous
 * clicks and the debounced refetch-on-Realtime-change (CustomersTable.tsx), which refetches
 * whatever page is currently showing instead of merging raw postgres_changes events into a
 * paginated list (same reasoning as CartOverview.tsx's getCustomerCartsPageAction). */
export async function getCustomersPageAction(params: {
  page: number;
  pageSize: number;
}): Promise<
  | { ok: true; customers: Customer[]; totalCount: number; noteCounts: Array<[string, number]> }
  | { ok: false; error: string }
> {
  try {
    const offset = (params.page - 1) * params.pageSize;
    const { customers, totalCount } = await listCustomersPage({ limit: params.pageSize, offset });
    // Note counts only need to cover whatever's on THIS page -- bundled into the same round trip
    // rather than a separate call, same reasoning as resolving product titles/variant details
    // alongside getCustomerCartsPageAction above. Its own try/catch so a notes-system hiccup
    // degrades to "no badges this page" rather than failing the whole page's customer list --
    // same degrade-gracefully convention as page.tsx's salesReps/noteCounts handling.
    let noteCounts = new Map<string, number>();
    try {
      noteCounts = await listNoteCountsFor('customer', customers.map((c) => c.id));
    } catch (err) {
      console.error('[customers:getPage] listNoteCountsFor failed:', err);
    }
    return { ok: true, customers, totalCount, noteCounts: [...noteCounts.entries()] };
  } catch (error) {
    return { ok: false, error: safeActionError(error, 'Could not load customers. Please try again.', 'customers:getPage') };
  }
}

/** Backs the "By Sales Rep" tab -- fetched lazily (only when that tab is first opened), not
 * eagerly alongside the main paginated table on every /customers load. Most admin visits never
 * switch to this tab, so eager-fetching the full approved-customer set on every page load would
 * undercut the whole point of paginating the main table in the first place (confirmed live this
 * session: it was adding a full extra round trip to every /customers navigation). */
export async function getApprovedCustomersForRepViewAction(): Promise<
  { ok: true; customers: Customer[] } | { ok: false; error: string }
> {
  try {
    const customers = await listApprovedCustomersForRepView();
    return { ok: true, customers };
  } catch (error) {
    return { ok: false, error: safeActionError(error, 'Could not load approved customers. Please try again.', 'customers:getRepView') };
  }
}

export async function listNotesAction(entityType: NoteEntityType, entityId: string): Promise<InternalNote[]> {
  return listNotes(entityType, entityId);
}

export async function createNoteAction(
  entityType: NoteEntityType,
  entityId: string,
  body: string
): Promise<{ ok: true; note: InternalNote } | { ok: false; error: string }> {
  try {
    const note = await createNote(entityType, entityId, body);
    return { ok: true, note };
  } catch (error) {
    return { ok: false, error: safeActionError(error, 'Failed to create note. Please try again.', 'internal-notes:create') };
  }
}

export type CustomerCartsPageResult = CustomerCartsPage & {
  items: CartSnapshotRow[];
  /** Serialized as an array, not a Map -- Server Action return values go through React's Flight
   * serializer, which doesn't guarantee Map support across every Next.js version, so this stays
   * in the safest common shape and the caller rebuilds a Map client-side. */
  productTitles: Array<[string, string]>;
  /** Flavour name + parent product title + current price, keyed by variant_id -- lets the cart
   * list show what was actually added (not just the product line) and its price, and lets the
   * client compute a real per-customer subtotal instead of just an item count. */
  variantDetails: Array<[string, VariantDetail]>;
};

/** Backs the /cart page's "Current Carts by Customer" pagination and search -- called from the
 * client whenever the admin changes page or types a search, so that work happens as a real
 * Supabase-side query (see list_customer_carts) rather than re-slicing an already-fetched full
 * table in the browser. Also resolves product titles (for the activity feed, which only has
 * product-level ids) and variant details (for the cart list, which has real variant ids and
 * needs price) for whatever items come back on this page, since a different page can reference
 * products/variants the initial server-render's maps never saw.
 */
export async function getCustomerCartsPageAction(params: {
  search: string;
  page: number;
  pageSize: number;
  knownProductTitles: Array<[string, string]>;
  knownVariantDetails: Array<[string, VariantDetail]>;
}): Promise<{ ok: true; result: CustomerCartsPageResult } | { ok: false; error: string }> {
  try {
    const offset = (params.page - 1) * params.pageSize;
    const { customers, totalCount, totalItems } = await listCustomerCartsPage({
      search: params.search,
      limit: params.pageSize,
      offset,
    });

    const items = await listCartSnapshotForCustomers(customers.map((c) => c.customerId));

    const knownTitles = new Map(params.knownProductTitles);
    const missingIds = [...new Set(items.map((i) => i.product_id))].filter((id) => !knownTitles.has(id));
    const knownVariants = new Map(params.knownVariantDetails);
    const missingVariantIds = [...new Set(items.map((i) => i.variant_id))].filter((id) => !knownVariants.has(id));

    // Independent Shopify lookups -- run together rather than one after the other.
    const [resolved, resolvedVariants] = await Promise.all([
      missingIds.length > 0 ? getProductTitlesByIds(missingIds) : new Map<string, string>(),
      missingVariantIds.length > 0 ? getVariantDetailsByIds(missingVariantIds) : new Map<string, VariantDetail>(),
    ]);

    return {
      ok: true,
      result: {
        customers,
        totalCount,
        totalItems,
        items,
        productTitles: [...resolved.entries()],
        variantDetails: [...resolvedVariants.entries()],
      },
    };
  } catch (error) {
    return { ok: false, error: safeActionError(error, 'Could not load carts. Please try again.', 'cart:getPage') };
  }
}
