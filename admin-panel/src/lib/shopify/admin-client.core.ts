// No `server-only` import here deliberately — this file is imported both by the Next.js app
// (via the guarded `admin-client.ts` wrapper, which does have the guard) and by standalone
// setup scripts run directly via tsx/Node (scripts/shopify/*.ts), where `server-only` always
// throws regardless of context since it depends on Next.js's webpack module resolution to be a
// no-op. Do not import this file directly from app code — import `./admin-client` instead.

function assertShopifyEnv() {
  const missing: string[] = [];
  if (!process.env.SHOPIFY_STORE_DOMAIN) missing.push('SHOPIFY_STORE_DOMAIN');
  if (!process.env.SHOPIFY_API_VERSION) missing.push('SHOPIFY_API_VERSION');
  // Two supported auth modes: a static Admin API access token (custom apps installed directly
  // from the store admin -- these don't support the client_credentials grant at all, and calling
  // it returns "shop_not_permitted"), or the client_credentials OAuth grant (Partner-managed apps
  // in the same org as the store). Prefer the static token when present.
  if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    if (!process.env.SHOPIFY_CLIENT_ID) missing.push('SHOPIFY_CLIENT_ID');
    if (!process.env.SHOPIFY_CLIENT_SECRET) missing.push('SHOPIFY_CLIENT_SECRET');
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required Shopify env var(s): ${missing.join(', ')}. Check .env.local (see .env.example).`
    );
  }
  return {
    domain: process.env.SHOPIFY_STORE_DOMAIN!,
    clientId: process.env.SHOPIFY_CLIENT_ID,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    apiVersion: process.env.SHOPIFY_API_VERSION!,
    staticAccessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  };
}

export class ShopifyAdminApiError extends Error {
  constructor(
    message: string,
    public readonly errors: unknown
  ) {
    super(message);
    this.name = 'ShopifyAdminApiError';
  }
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

/**
 * Client credentials grant (app + store are in the same org) — tokens expire in 24h
 * (expires_in: 86399), so cache and refresh ~60s early instead of re-authenticating per request.
 * https://shopify.dev/docs/apps/build/dev-dashboard/get-api-access-tokens
 */
async function getAccessToken(): Promise<string> {
  const { domain, clientId, clientSecret, staticAccessToken } = assertShopifyEnv();

  if (staticAccessToken) return staticAccessToken;

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId!,
      client_secret: clientSecret!,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ShopifyAdminApiError(
      `Shopify OAuth token request failed with status ${response.status}`,
      await response.text().catch(() => null)
    );
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

interface GraphQLResponse<TData> {
  data?: TData;
  errors?: unknown;
}

interface GraphQLErrorEntry {
  message: string;
  extensions?: { code?: string };
}

/** Live-verified 2026-09-18 against this store's app: requesting `email`/`phone`/`shippingAddress.
 * address1`/`.address2`/`.zip`/`customer.firstName`/`.lastName` on a DraftOrder returns Shopify's
 * standard `errors` array with `extensions.code: "ACCESS_DENIED"` for EACH blocked field
 * individually, alongside a fully-populated `data` for every other field in the same response
 * (Shopify's GraphQL responses can carry both `errors` and partial `data` together -- this is not
 * a total request failure). Confirmed a Shopify PLAN-tier gate (Protected Customer Data requires
 * the Shopify/Advanced/Plus plan -- this store's own app configuration screen offers only an
 * "Upgrade plan" button, no request-access flow), not something resolvable by requesting different
 * scopes. */
function isProtectedCustomerDataError(error: unknown): error is GraphQLErrorEntry {
  return (
    typeof error === 'object' &&
    error !== null &&
    'extensions' in error &&
    (error as GraphQLErrorEntry).extensions?.code === 'ACCESS_DENIED' &&
    /Customer object/i.test((error as GraphQLErrorEntry).message ?? '')
  );
}

async function rawShopifyAdminRequest<TData, TVariables = Record<string, unknown>>(
  query: string,
  variables?: TVariables
): Promise<GraphQLResponse<TData>> {
  const { domain, apiVersion } = assertShopifyEnv();
  const accessToken = await getAccessToken();

  const response = await fetch(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ShopifyAdminApiError(
      `Shopify Admin API request failed with status ${response.status}`,
      await response.text().catch(() => null)
    );
  }

  return (await response.json()) as GraphQLResponse<TData>;
}

/**
 * The single entry point for calling Shopify's Admin GraphQL API. Every current and future
 * milestone (metaobjects now; Draft Orders, customer tagging, bulk ops later) should import
 * this instead of hand-rolling fetch calls.
 */
export async function shopifyAdminRequest<TData, TVariables = Record<string, unknown>>(
  query: string,
  variables?: TVariables
): Promise<TData> {
  const result = await rawShopifyAdminRequest<TData, TVariables>(query, variables);

  if (result.errors) {
    throw new ShopifyAdminApiError('Shopify Admin API returned GraphQL errors', result.errors);
  }
  if (result.data === undefined) {
    throw new ShopifyAdminApiError('Shopify Admin API response had no data field', result);
  }

  return result.data;
}

/**
 * Same as `shopifyAdminRequest`, except it does NOT throw when every error in the response is the
 * store's Protected Customer Data plan restriction (see `isProtectedCustomerDataError`) -- those
 * specific fields come back `null` in `data` (Shopify's own behavior, not something this function
 * fabricates), and the caller is expected to backfill them from elsewhere (e.g. this app's own
 * Supabase `customers` table) rather than lose the entire response over it. Any OTHER error still
 * throws exactly like `shopifyAdminRequest` -- this only tolerates the one specific, known,
 * structural gap, never surprises.
 */
export async function shopifyAdminRequestAllowingPiiGaps<TData, TVariables = Record<string, unknown>>(
  query: string,
  variables?: TVariables
): Promise<TData> {
  const result = await rawShopifyAdminRequest<TData, TVariables>(query, variables);

  if (result.errors) {
    const errorList = Array.isArray(result.errors) ? result.errors : [result.errors];
    const unexpected = errorList.filter((e) => !isProtectedCustomerDataError(e));
    if (unexpected.length > 0) {
      throw new ShopifyAdminApiError('Shopify Admin API returned GraphQL errors', result.errors);
    }
  }
  if (result.data === undefined) {
    throw new ShopifyAdminApiError('Shopify Admin API response had no data field', result);
  }

  return result.data;
}

/**
 * Shopify mutations return userErrors as data, not as a thrown error — this centralizes the
 * check every mutation call site needs instead of reimplementing the same `if` everywhere.
 */
export function assertNoUserErrors(
  userErrors: Array<{ field?: string[] | null; message: string }> | undefined | null,
  mutationLabel: string
): void {
  if (userErrors && userErrors.length > 0) {
    throw new ShopifyAdminApiError(
      `${mutationLabel} returned userErrors`,
      userErrors
    );
  }
}
