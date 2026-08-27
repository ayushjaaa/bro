'use server';

import { revalidatePath } from 'next/cache';
import {
  createFilterDefinition,
  attachFilterToSubcategory,
  addChoiceToFilter,
  type FilterLevel,
} from '@/data/filters';

/** Thin Server Action — extract FormData, call the DAL (which does both the metaobject and the
 * matching metafieldDefinition in one place, §7.1), attach to the Sub-category, revalidate. */
export async function createFilterAction(formData: FormData) {
  const level = String(formData.get('level') ?? 'product') as FilterLevel;
  const choicesRaw = String(formData.get('choices') ?? '');
  const choices = choicesRaw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  const definition = await createFilterDefinition({
    label: String(formData.get('label') ?? ''),
    key: String(formData.get('key') ?? ''),
    level,
    choices: level === 'native' ? undefined : choices,
    nativeField: level === 'native' ? (formData.get('nativeField') as any) : undefined,
  });

  await attachFilterToSubcategory(String(formData.get('subcategoryId') ?? ''), definition.id);

  revalidatePath('/taxonomy');
  return definition;
}

/** Thin Server Action — appends one new Choice value to an existing filter (add-only, §7.4-6). */
export async function addChoiceToFilterAction(formData: FormData) {
  const filterDefinitionId = String(formData.get('filterDefinitionId') ?? '');
  const newChoice = String(formData.get('newChoice') ?? '');

  const definition = await addChoiceToFilter(filterDefinitionId, newChoice);

  revalidatePath('/taxonomy');
  revalidatePath('/products/new');
  return definition;
}
