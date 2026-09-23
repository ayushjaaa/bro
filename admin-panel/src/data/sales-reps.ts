import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { requireAdmin } from './admin-auth';
import { SafeActionError } from '@/lib/action-errors';
import { validateSalesRepInput } from '@/lib/sales-rep-input';
export { validateSalesRepInput };

function getServiceRoleClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface SalesRep {
  id: string;
  name: string;
  phone: string;
  email: string;
}

function toSalesRep(row: any): SalesRep {
  return { id: row.id, name: row.name, phone: row.phone, email: row.email };
}

/** A small, reusable rep list -- assigned to customers (customers.sales_rep_id), not
 * free-text retyped per customer, so updating a rep's number here updates it everywhere
 * they're assigned. Low-sensitivity (a business contact list), so no admin gate on read is
 * strictly required by RLS, but this function is admin-panel-only regardless. */
export async function listSalesReps(): Promise<SalesRep[]> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from('sales_reps').select('*').order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toSalesRep);
}

export async function createSalesRep(input: { name: string; phone: string; email: string }): Promise<SalesRep> {
  await requireAdmin();
  const invalid = validateSalesRepInput(input);
  if (invalid) throw new SafeActionError(invalid);
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from('sales_reps').insert({ name: input.name, phone: input.phone, email: input.email }).select('*').single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create sales rep');
  return toSalesRep(data);
}

/** Updates a rep in place -- since customers reference reps by id (`customers.sales_rep_id`),
 * editing a rep's phone/email here updates it everywhere they're assigned, no per-customer
 * edits needed. */
export async function updateSalesRep(
  id: string,
  input: { name: string; phone: string; email: string }
): Promise<SalesRep> {
  await requireAdmin();
  const invalid = validateSalesRepInput(input);
  if (invalid) throw new SafeActionError(invalid);
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from('sales_reps').update({ name: input.name, phone: input.phone, email: input.email }).eq('id', id).select('*').single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to update sales rep');
  return toSalesRep(data);
}
