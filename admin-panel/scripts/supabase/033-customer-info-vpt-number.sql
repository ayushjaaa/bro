-- Lets an admin edit a customer's VPT (Vaping Products Tax) number through the same
-- optimistic-locking RPC that 031-customer-info-versioning.sql set up for every other
-- application-info field. `vpt_number` already exists as a plain text column (005-create-
-- customers.sql) but was never wired into this function, so it silently ignored any
-- `vptNumber` key in p_fields until now.
--
-- Safe to re-run.

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
    vpt_number              = case when p_fields ? 'vptNumber' then p_fields->>'vptNumber' else vpt_number end,
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
-- select proname from pg_proc where proname = 'update_customer_application_info';
-- select pg_get_functiondef('update_customer_application_info'::regproc) like '%vpt_number%';
