import 'server-only';
import { shopifyAdminRequest, assertNoUserErrors } from './admin-client';

/** Finds-or-creates a Shopify Customer by email in one round trip -- called when an admin
 * approves a pending registration (src/data/customers.ts). Needs the `write_customers` scope.
 *
 * Was previously a separate search (FIND_CUSTOMER_QUERY) + conditional create, which is the
 * two-network-call window that (before 030's claim/finalize split closed the real race at the DB
 * level) let two concurrent approvals of the same customer both see "not found" and both attempt
 * to create. `customerSet`'s `identifier: {email}` upsert collapses that into one call: only
 * updates or creates the record with that email, never a duplicate. Note this is a convenience/
 * consistency win, not a concurrency guarantee from Shopify itself -- confirmed against Shopify's
 * docs that customerSet is not on their idempotency-key-supported mutation list and has no
 * documented behavior for two truly simultaneous calls with the same email. The actual race is
 * already closed by 030's claim step running first, so only the admin who wins that ever reaches
 * this function at all.
 *
 * The response only ever requests `id`, never `email` -- unrelated to the race-safety change
 * above, this store's plan blocks PII fields on query *responses* (ACCESS_DENIED, see
 * admin-client.core.ts) and asking for one fails the whole call. `customerSet`'s `input.email` is
 * a value being WRITTEN, not read back, so this is unaffected -- confirmed live against the store.
 *
 * BUG FOUND AND FIXED (2026-10-01, caught manually testing Approve in a real browser, not by any
 * automated test): the `$identifier` variable's declared type was wrong -- `CustomerIdentifierInput!`
 * doesn't exist on this API version; the correct type (confirmed directly against the live GraphQL
 * endpoint) is `CustomerSetIdentifiers!`. The mismatched type made EVERY customerSet call fail at
 * the GraphQL validation stage with a `variableMismatch` error, before ever reaching Shopify's own
 * customer logic -- every Approve attempt in this whole session failed with "Could not reach
 * Shopify" because of this, which was wrongly assumed to be a missing-credentials environment
 * limitation. It wasn't -- credentials were valid throughout (verified separately against
 * /admin/api/.../shop.json, which returned 200). No automated test caught this because none of them
 * exercise a successful Approve all the way through Shopify -- customer-approval-races.test.ts
 * tests the RPCs directly (no Shopify call at all), and approve-race.spec.ts deliberately avoids
 * the Shopify step by pre-claiming the row so the UI test only needs the claim guard to fire. A
 * real gap: nothing end-to-end covered "does a full, successful Approve actually reach Shopify and
 * get a customer id back." */

const CUSTOMER_SET_MUTATION = /* GraphQL */ `
  mutation SetCustomer($identifier: CustomerSetIdentifiers!, $input: CustomerSetInput!) {
    customerSet(identifier: $identifier, input: $input) {
      customer {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function findOrCreateShopifyCustomer(
  email: string,
  firstName: string,
  lastName: string
): Promise<string> {
  const data = await shopifyAdminRequest<any>(CUSTOMER_SET_MUTATION, {
    identifier: { email },
    input: { email, firstName, lastName },
  });
  assertNoUserErrors(data.customerSet.userErrors, 'customerSet');
  return data.customerSet.customer.id as string;
}
