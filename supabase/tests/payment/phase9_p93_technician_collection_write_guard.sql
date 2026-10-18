-- Phase 9 P9.3 technician collection payable guard regression
-- Payment Test only. Must end with ROLLBACK.
begin;

insert into public.business_finance_settings(
  id,legal_name,address,contact_email,tax_number,vat_registered,tax_rate,currency,
  payment_domain_enabled,gateway_enabled
) values (true,'QA P9.3','QA','qa@example.com','',false,0,'SAR',false,false);

insert into public.service_requests(
  customer_name,phone,service_type,problem_description,city,address,
  customer_email,payment_choice_timing,payment_policy_snapshot
) values (
  'QA P9.3','0500000093','QA','QA','Makkah','QA','qa-p93@example.com','prepay',
  jsonb_build_object('version',1,'policy',
    (select payment_policy from public.business_finance_settings where id=true))
);

select set_config(
  'qa.p93.req',
  (select id::text from public.service_requests where customer_name='QA P9.3' order by created_at desc limit 1),
  true
);

insert into public.service_request_items(
  service_request_id,catalog_service_id,service_name,quantity,
  net_unit_price,tax_rate,gross_unit_price,item_source
) values (
  current_setting('qa.p93.req')::uuid,
  '2b4925a8-35ed-4378-99a2-f4a5045ed36a'::uuid,
  'QA P9.3 Service',1,50,0,50,'customer_request'
);

insert into public.service_request_assignments(
  service_request_id,technician_id,assigned_by,status,responded_at,notes
) values (
  current_setting('qa.p93.req')::uuid,
  'e115b07d-1d76-43b4-8d0e-b42622bf5f22'::uuid,
  '37d28ad8-e850-4861-8dd5-95deba60d5fd'::uuid,
  'accepted',now(),'QA P9.3 accepted'
);

select set_config('request.jwt.claim.sub','bc3e11cc-1a2f-4fc8-a22d-28e04cacc506',true);

do $$
begin
  begin
    perform public.technician_record_collection(
      current_setting('qa.p93.req')::uuid,'cash',30,'qa-p93-disabled','QA disabled',now()
    );
    raise exception 'P93_DISABLED_GUARD_FAILED';
  exception when raise_exception then
    if sqlerrm<>'payment_domain_not_enabled' then raise; end if;
  end;
end $$;

update public.business_finance_settings set payment_domain_enabled=true where id=true;

select set_config(
  'qa.p93.first',
  public.technician_record_collection(
    current_setting('qa.p93.req')::uuid,'cash',30,'qa-p93-first','QA first',now()
  )::text,
  true
);

do $$
declare again uuid; s jsonb;
begin
  again:=public.technician_record_collection(
    current_setting('qa.p93.req')::uuid,'cash',30,'qa-p93-first','QA first',now()
  );
  if again<>current_setting('qa.p93.first')::uuid then
    raise exception 'P93_IDEMPOTENT_RETRY_FAILED';
  end if;

  if (select count(*) from public.technician_collections
      where service_request_id=current_setting('qa.p93.req')::uuid
        and idempotency_key='qa-p93-first')<>1 then
    raise exception 'P93_IDEMPOTENT_DUPLICATE_CREATED';
  end if;

  s:=private.payment_financial_state(current_setting('qa.p93.req')::uuid);
  if (s->>'payable_cap')::numeric<>20 or (s->>'payable_now')::numeric<>20 then
    raise exception 'P93_REMAINING_EXPECTED_20';
  end if;

  begin
    perform public.technician_record_collection(
      current_setting('qa.p93.req')::uuid,'cash',29,'qa-p93-first','QA first',now()
    );
    raise exception 'P93_IDEMPOTENCY_CONFLICT_FAILED';
  exception when raise_exception then
    if sqlerrm<>'collection_idempotency_conflict' then raise; end if;
  end;

  begin
    perform public.technician_record_collection(
      current_setting('qa.p93.req')::uuid,'cash',21,'qa-p93-over','QA over',now()
    );
    raise exception 'P93_CAP_GUARD_FAILED';
  exception when raise_exception then
    if sqlerrm<>'collection_exceeds_payable_now' then raise; end if;
  end;
end $$;

select set_config(
  'qa.p93.second',
  public.technician_record_collection(
    current_setting('qa.p93.req')::uuid,'cash',20,'qa-p93-second','QA second',now()
  )::text,
  true
);

do $$
declare s jsonb;
begin
  s:=private.payment_financial_state(current_setting('qa.p93.req')::uuid);
  if (s->>'technician_cash_custody')::numeric<>50 then
    raise exception 'P93_CUSTODY_EXPECTED_50';
  end if;
  if (s->>'payable_cap')::numeric<>0 or (s->>'payable_now')::numeric<>0 then
    raise exception 'P93_PAYABLE_EXPECTED_0';
  end if;

  begin
    perform public.technician_record_collection(
      current_setting('qa.p93.req')::uuid,'cash',1,'qa-p93-third','QA third',now()
    );
    raise exception 'P93_ZERO_PAYABLE_GUARD_FAILED';
  exception when raise_exception then
    if sqlerrm<>'nothing_payable_now' then raise; end if;
  end;
end $$;

select jsonb_build_object(
  'collection_count',(select count(*) from public.technician_collections where service_request_id=current_setting('qa.p93.req')::uuid),
  'cash_custody',(private.payment_financial_state(current_setting('qa.p93.req')::uuid)->>'technician_cash_custody')::numeric,
  'payable_cap',(private.payment_financial_state(current_setting('qa.p93.req')::uuid)->>'payable_cap')::numeric,
  'payable_now',(private.payment_financial_state(current_setting('qa.p93.req')::uuid)->>'payable_now')::numeric
) as phase9_p93_result;

rollback;
