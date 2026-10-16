'use server';

import { listCustomerActivity, type ActivityRow } from '@/data/activity';
import { safeActionError } from '@/lib/action-errors';

export type ActivityPageResult = { rows: ActivityRow[]; totalCount: number };

/** Client-side search/pagination for the Activity table, mirroring
 * `getCustomerCartsPageAction` (features/customers/actions.ts) -- `listCustomerActivity` itself
 * already calls `requireAdmin()`, so this action doesn't duplicate that check. */
export async function getActivityPageAction(params: {
  search: string;
  page: number;
  customerId?: string;
}): Promise<{ ok: true; result: ActivityPageResult } | { ok: false; error: string }> {
  try {
    const { rows, totalCount } = await listCustomerActivity({
      page: params.page,
      search: params.search,
      customerId: params.customerId,
    });
    return { ok: true, result: { rows, totalCount } };
  } catch (error) {
    return { ok: false, error: safeActionError(error, 'Could not load activity. Please try again.', 'activity:getPage') };
  }
}
