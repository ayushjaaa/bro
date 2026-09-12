'use server';

import { revalidatePath } from 'next/cache';
import {
  approveCustomer,
  rejectCustomer,
  updateAccountType,
  updateCustomerSalesRep,
  getRegistrationDocumentUrl,
  listCustomerCartsPage,
  listCartSnapshotForCustomers,
  type CustomerCartsPage,
  type CartSnapshotRow,
} from '@/data/customers';
import { getProductTitlesByIds, getVariantDetailsByIds, type VariantDetail } from '@/data/products';
import { listSalesReps, createSalesRep, type SalesRep } from '@/data/sales-reps';
import { listNotes, createNote, type NoteEntityType, type InternalNote } from '@/data/internal-notes';

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
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to create sales rep' };
  }
}

export async function updateCustomerSalesRepAction(customerId: string, salesRepId: string | null) {
  await updateCustomerSalesRep(customerId, salesRepId);
  revalidatePath('/customers');
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
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to create note' };
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
}): Promise<CustomerCartsPageResult> {
  const offset = (params.page - 1) * params.pageSize;
  const { customers, totalCount, totalItems } = await listCustomerCartsPage({
    search: params.search,
    limit: params.pageSize,
    offset,
  });

  const items = await listCartSnapshotForCustomers(customers.map((c) => c.customerId));

  const knownTitles = new Map(params.knownProductTitles);
  const missingIds = [...new Set(items.map((i) => i.product_id))].filter((id) => !knownTitles.has(id));
  const resolved = missingIds.length > 0 ? await getProductTitlesByIds(missingIds) : new Map<string, string>();

  const knownVariants = new Map(params.knownVariantDetails);
  const missingVariantIds = [...new Set(items.map((i) => i.variant_id))].filter((id) => !knownVariants.has(id));
  const resolvedVariants =
    missingVariantIds.length > 0 ? await getVariantDetailsByIds(missingVariantIds) : new Map<string, VariantDetail>();

  return {
    customers,
    totalCount,
    totalItems,
    items,
    productTitles: [...resolved.entries()],
    variantDetails: [...resolvedVariants.entries()],
  };
}
