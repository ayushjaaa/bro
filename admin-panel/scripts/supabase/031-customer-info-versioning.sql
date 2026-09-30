-- Optimistic-locking ("version") support for admins editing a customer's application info
-- (business name, address, phone, etc -- everything EXCEPT email, which stays tied to Supabase
-- Auth, and everything approval-related, which only ever moves through 030's functions).
--
-- Why versioning here and not the claim/status pattern from 030: editing free-form info has no
-- natural "state machine" to guard on, and two admins editing the same customer's info at the
-- exact same moment is rare, low-stakes, and reversible -- unlike Approve's external Shopify call.
-- This is the textbook case for optimistic concurrency control (confirmed against Microsoft's EF
-- Core concurrency docs and Martin Fowler's "Optimistic Offline Lock" pattern): let admins edit
-- freely, only check for a conflict at save time, via a single atomic guarded UPDATE -- never a
-- separate "check version, then update" (that would reintroduce the exact race 030 was written to
-- close, just in a new place).
--
-- Safe to re-run.

alter table customers add column if not exists version integer not null default 1;

-- p_fields is a JSONB object containing ONLY the keys the admin actually changed (a partial
-- update) -- camelCase keys matching the JS Customer type, checked with `?` (key-exists) rather
-- than a fixed positional parameter list, so an omitted key leaves that column untouched instead
-- of overwriting it with null. Returns the new version so the caller can keep editing without a
-- reload. Raises a distinct, identifiable error for "version conflict" vs "row not found" so the
-- frontend can react correctly to each (never the same generic message for both).
create or replace function update_customer_application_info(
  p_id uuid,
  p_version integer,
  p_fields jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_version integer;
  v_exists boolean;
begin
  select exists(select 1 from customers where id = p_id) into v_exists;
  if not v_exists then
    raise exception 'Customer % not found.', p_id using errcode = 'P0002';
  end if;

  update customers set
    first_name           = coalesce(p_fields->>'firstName', first_name),
    last_name             = coalesce(p_fields->>'lastName', last_name),
    phone                  = case when p_fields ? 'phone' then p_fields->>'phone' else phone end,
    personal_cell          = case when p_fields ? 'personalCell' then p_fields->>'personalCell' else personal_cell end,
    legal_business_name    = coalesce(p_fields->>'legalBusinessName', legal_business_name),
    operating_name         = case when p_fields ? 'operatingName' then p_fields->>'operatingName' else operating_name end,
    business_number        = case when p_fields ? 'businessNumber' then p_fields->>'businessNumber' else business_number end,
    num_stores             = case when p_fields ? 'numStores' then (p_fields->>'numStores')::integer else num_stores end,
    business_types         = case when p_fields ? 'businessTypes'
                                then (select array_agg(x) from jsonb_array_elements_text(p_fields->'businessTypes') x)
                                else business_types end,
    monthly_purchase_range = case when p_fields ? 'monthlyPurchaseRange' then p_fields->>'monthlyPurchaseRange' else monthly_purchase_range end,
    sells_online            = case when p_fields ? 'sellsOnline' then (p_fields->>'sellsOnline')::boolean else sells_online end,
    online_url              = case when p_fields ? 'onlineUrl' then p_fields->>'onlineUrl' else online_url end,
    instagram_handle        = case when p_fields ? 'instagramHandle' then p_fields->>'instagramHandle' else instagram_handle end,
    ship_line1              = coalesce(p_fields->>'shipLine1', ship_line1),
    ship_line2              = case when p_fields ? 'shipLine2' then p_fields->>'shipLine2' else ship_line2 end,
    ship_city               = coalesce(p_fields->>'shipCity', ship_city),
    ship_province           = coalesce(p_fields->>'shipProvince', ship_province),
    ship_postal_code        = coalesce(p_fields->>'shipPostalCode', ship_postal_code),
    bill_same_as_shipping   = case when p_fields ? 'billSameAsShipping' then (p_fields->>'billSameAsShipping')::boolean else bill_same_as_shipping end,
    bill_line1              = case when p_fields ? 'billLine1' then p_fields->>'billLine1' else bill_line1 end,
    bill_line2              = case when p_fields ? 'billLine2' then p_fields->>'billLine2' else bill_line2 end,
    bill_city               = case when p_fields ? 'billCity' then p_fields->>'billCity' else bill_city end,
    bill_province           = case when p_fields ? 'billProvince' then p_fields->>'billProvince' else bill_province end,
    bill_postal_code        = case when p_fields ? 'billPostalCode' then p_fields->>'billPostalCode' else bill_postal_code end,
    tax_exempt              = case when p_fields ? 'taxExempt' then (p_fields->>'taxExempt')::boolean else tax_exempt end,
    referral_source         = case when p_fields ? 'referralSource' then p_fields->>'referralSource' else referral_source end,
    version                 = version + 1,
    updated_at              = now()
  where id = p_id and version = p_version
  returning version into v_new_version;

  if v_new_version is null then
    raise exception 'This customer''s info was changed by someone else -- please refresh and try again.'
      using errcode = 'P0001';
  end if;

  return v_new_version;
end;
$$;

revoke all on function update_customer_application_info(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function update_customer_application_info(uuid, integer, jsonb) to service_role;

-- VERIFY:
-- select column_name from information_schema.columns where table_name = 'customers' and column_name = 'version';
-- select proname from pg_proc where proname = 'update_customer_application_info';
