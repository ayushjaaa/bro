import type { Customer } from '@/data/customers';

/**
 * Maps a raw `customers` DB row (snake_case) to the app's `Customer` shape (camelCase). Lives
 * here, not in `data/customers.ts` (which has `import 'server-only'`), specifically so
 * `useLiveTable`'s client-side Realtime handler can use the SAME mapping the server uses for the
 * initial page load -- discovered missing via a live Playwright test (e2e/customers/live-sync.spec.ts):
 * without it, a Realtime `postgres_changes` payload (always raw snake_case column names) was being
 * applied directly as if it were already a `Customer`, so every field after the first live update
 * went blank (`customer.firstName` reading `undefined` off a `{ first_name: ... }` object).
 *
 * `previous` carries over `salesRep` (name/phone/email) when the assigned rep hasn't changed --
 * a Realtime payload is a raw table-row change with no joined data, so it can never know a new
 * rep's contact details on its own; if `sales_rep_id` DID change, this intentionally falls back
 * to `null` (shows "Unassigned" until the next full list load) rather than showing a stale name
 * next to a now-wrong rep id.
 */
export function mapCustomerRow(row: any, previous?: Customer): Customer {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    personalCell: row.personal_cell,
    businessName: row.business_name,
    businessRegistrationNumber: row.business_registration_number,
    pstNumber: row.pst_number,
    vptNumber: row.vpt_number,
    typeOfBusiness: row.type_of_business,
    licenseNumber: row.license_number,
    accountType: row.account_type,
    accountNumber: row.account_number,
    salesRepId: row.sales_rep_id ?? null,
    salesRep: row.sales_reps ?? (previous && previous.salesRepId === (row.sales_rep_id ?? null) ? previous.salesRep : null),
    status: row.status,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    shopifyCustomerId: row.shopify_customer_id,
    version: row.version,
    legalBusinessName: row.legal_business_name,
    operatingName: row.operating_name,
    businessNumber: row.business_number,
    numStores: row.num_stores,
    businessTypes: row.business_types,
    monthlyPurchaseRange: row.monthly_purchase_range,
    sellsOnline: row.sells_online,
    onlineUrl: row.online_url,
    instagramHandle: row.instagram_handle,
    shipLine1: row.ship_line1,
    shipLine2: row.ship_line2,
    shipCity: row.ship_city,
    shipProvince: row.ship_province,
    shipPostalCode: row.ship_postal_code,
    billSameAsShipping: row.bill_same_as_shipping,
    billLine1: row.bill_line1,
    billLine2: row.bill_line2,
    billCity: row.bill_city,
    billProvince: row.bill_province,
    billPostalCode: row.bill_postal_code,
    businessLicencePath: row.business_licence_path,
    specialtyLicencePath: row.specialty_licence_path,
    taxExempt: row.tax_exempt,
    referralSource: row.referral_source,
    signatureName: row.signature_name,
    signedAt: row.signed_at,
  };
}
