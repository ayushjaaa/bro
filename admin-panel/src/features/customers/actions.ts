'use server';

import { revalidatePath } from 'next/cache';
import { approveCustomer, rejectCustomer, updateAccountType } from '@/data/customers';

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
