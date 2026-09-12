'use server';

import { revalidatePath } from 'next/cache';
import { updateSalesRep, type SalesRep } from '@/data/sales-reps';

export async function updateSalesRepAction(
  id: string,
  input: { name: string; phone: string; email: string }
): Promise<{ ok: true; rep: SalesRep } | { ok: false; error: string }> {
  try {
    const rep = await updateSalesRep(id, input);
    // Rep names/contact info render on both this page and the Customers page (table pill +
    // drawer), so both need to pick up the change.
    revalidatePath('/sales-reps');
    revalidatePath('/customers');
    return { ok: true, rep };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to update sales rep' };
  }
}
