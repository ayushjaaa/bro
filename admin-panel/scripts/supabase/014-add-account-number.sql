-- Account number, assigned at approval (not at signup) -- a pending/rejected applicant never
-- consumed a slot in the sequence, since they never became a real customer. Format:
-- <W|R>-<PROVINCE>-<YY>-<SEQ>, e.g. "W-ON-26-0142" -- Wholesale, Ontario, approved 2026, the
-- 142nd account ever approved (one global sequence, not per-bucket, so no race-condition-prone
-- per-bucket counters). Province is a snapshot of ship_province at the moment of approval (the
-- full 13-value Canadian province/territory list collected at signup -- storefront's
-- CANADIAN_PROVINCES -- not the separate 6-value excise-stamp "region" system used for stock
-- filtering); a missing/unrecognized province gets "XX".

create sequence if not exists account_number_seq start 1;

alter table customers add column if not exists account_number text unique;

-- Was `language sql` (a single UPDATE) -- needs plpgsql now for the declare/case/coalesce logic
-- below. security definer + the revoke/grant lines stay identical to 005's original, so the
-- permission model (service_role only) is unchanged.
create or replace function approve_customer(
  p_id uuid,
  p_approved_by text,
  p_shopify_customer_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text;
  v_ship_province text;
  v_existing_number text;
  v_type_code text;
  v_province_code text;
  v_new_number text;
begin
  select account_type, ship_province, account_number
    into v_account_type, v_ship_province, v_existing_number
    from customers where id = p_id;

  v_type_code := case when v_account_type = 'wholesale' then 'W' else 'R' end;
  v_province_code := coalesce(
    case v_ship_province
      when 'Alberta' then 'AB' when 'British Columbia' then 'BC' when 'Manitoba' then 'MB'
      when 'New Brunswick' then 'NB' when 'Newfoundland and Labrador' then 'NL'
      when 'Nova Scotia' then 'NS' when 'Ontario' then 'ON'
      when 'Prince Edward Island' then 'PE' when 'Quebec' then 'QC'
      when 'Saskatchewan' then 'SK' when 'Northwest Territories' then 'NT'
      when 'Nunavut' then 'NU' when 'Yukon' then 'YT'
      else null
    end,
    'XX'
  );

  -- Idempotent: re-approving an already-approved (or previously approved, then rejected, now
  -- re-approved) customer never reissues a new number -- once assigned, permanent.
  v_new_number := coalesce(
    v_existing_number,
    v_type_code || '-' || v_province_code || '-' || to_char(now(), 'YY') || '-' ||
      lpad(nextval('account_number_seq')::text, 4, '0')
  );

  update customers
    set status = 'approved',
        approved_at = now(),
        approved_by = p_approved_by,
        shopify_customer_id = p_shopify_customer_id,
        account_number = v_new_number,
        updated_at = now()
    where id = p_id;
end;
$$;

revoke all on function approve_customer(uuid, text, text) from public, anon, authenticated;
grant execute on function approve_customer(uuid, text, text) to service_role;
