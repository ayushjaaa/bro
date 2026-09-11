import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { requireAdmin } from './admin-auth';

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
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from('sales_reps').insert(input).select('*').single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create sales rep');
  return toSalesRep(data);
}
