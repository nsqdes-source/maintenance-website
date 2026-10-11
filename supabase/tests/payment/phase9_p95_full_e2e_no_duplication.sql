-- Phase 9 P9.5 full E2E / no-duplication regression
-- PAYMENT TEST ONLY. Self-contained. Must end with ROLLBACK.
--
-- Covers:
-- 1) authoritative payable amount
-- 2) provider-neutral successful payment attempt
-- 3) confirmed canonical receipt + idempotent posting
-- 4) transfer to issued invoice without double counting
-- 5) successful refund against canonical request-payment origin
-- 6) reopened payable amount
-- 7) technician cash recollection of the refunded amount
-- 8) settlement/posting
-- 9) canonical reporting
-- 10) final no-duplication assertions

begin;

insert into public.business_finance_settings(
  id,legal_name,address,contact_email,tax_number,vat_registered,tax_rate,currency,
  payment_domain_enabled,gateway_enabled,gateway_provider,gateway_environment
) values (
  true,'QA P9.5','QA','qa-p95@example.com','',false,0,'SAR',
  true,true,'qa_gateway','test'
);

insert into public.service_requests(
  customer_name,phone,service_type,problem_description,city,address,
  customer_email,payment_choice_timing,payment_policy_snapshot
) values (
  'QA P9.5','0500000095','QA','QA','Makkah','QA','qa-p95@example.com',
  'prepay',
  jsonb_build_object(
    'version',1,
    'policy',(select payment_policy from public.business_finance_settings where id=true)
  )
);

select set_config(
  'qa.p95.req',
  (select id::text from public.service_requests
   where customer_name='QA P9.5'
   order by created_at desc limit 1),
  true
);

insert into public.service_request_items(
  service_request_id,catalog_service_id,service_name,quantity,
  net_unit_price,tax_rate,gross_unit_price,item_source
) values (
  current_setting('qa.p95.req')::uuid,
  '2b4925a8-35ed-4378-99a2-f4a5045ed36a'::uuid,
  'QA P9.5 Service',1,100,0,100,'customer_request'
);

insert into public.service_request_assignments(
  service_request_id,technician_id,assigned_by,status,responded_at,notes
) values (
  current_setting('qa.p95.req')::uuid,
  'e115b07d-1d76-43b4-8d0e-b42622bf5f22'::uuid,
  '37d28ad8-e850-4861-8dd5-95deba60d5fd'::uuid,
  'accepted',now(),'QA P9.5 accepted'
);

select set_config(
  'request.jwt.claim.sub',
  '37d28ad8-e850-4861-8dd5-95deba60d5fd',
  true
);

select set_config(
  'qa.p95.attempt',
  private.payment_create_authoritative_attempt(
    current_setting('qa.p95.req')::uuid,
    'qa_gateway',
    'test',
    'qa-p95-attempt'
  )::text,
  true
);

do $$
declare s jsonb;
begin
  s:=private.payment_financial_state(current_setting('qa.p95.req')::uuid);
  if (s->>'authoritative_charge')::numeric<>100
     or (s->>'payable_now')::numeric<>0
     or (s->>'reserved_amount')::numeric<>100 then
    raise exception 'P95_INITIAL_RESERVATION_FAILED_%',s;
  end if;
end $$;

select set_config(
  'qa.p95.event',
  private.payment_record_provider_event(
    'qa_gateway','test','qa-p95-event','payment.succeeded',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    current_setting('qa.p95.attempt')::uuid,
    'qa-p95-txn',
    '{}'::jsonb
  )::text,
  true
);

select private.payment_apply_verified_provider_result(
  current_setting('qa.p95.event')::uuid,
  'succeeded',
  'qa-p95-txn',
  100,
  'SAR',
  null
);

select set_config(
  'qa.p95.receipt',
  private.payment_post_verified_attempt(
    current_setting('qa.p95.attempt')::uuid,
    'qa-p95-post'
  )::text,
  true
);

do $$
declare r1 uuid; s jsonb;
begin
  r1:=private.payment_post_verified_attempt(
    current_setting('qa.p95.attempt')::uuid,
    'qa-p95-post'
  );
  if r1<>current_setting('qa.p95.receipt')::uuid then
    raise exception 'P95_PROVIDER_POST_IDEMPOTENCY_FAILED';
  end if;

  if (select count(*) from public.service_request_payments
      where service_request_id=current_setting('qa.p95.req')::uuid
        and voided_at is null)<>1 then
    raise exception 'P95_PROVIDER_DUPLICATE_RECEIPT';
  end if;

  s:=private.payment_financial_state(current_setting('qa.p95.req')::uuid);
  if (s->>'gross_receipts')::numeric<>100
     or (s->>'net_receipts')::numeric<>100
     or (s->>'remaining_contractual')::numeric<>0 then
    raise exception 'P95_PROVIDER_RECEIPT_STATE_FAILED_%',s;
  end if;
end $$;

update public.service_requests
set workflow_stage='completed'
where id=current_setting('qa.p95.req')::uuid;

select set_config(
  'qa.p95.invoice',
  public.finance_create_invoice(
    current_setting('qa.p95.req')::uuid,
    'QA P9.5 final invoice',
    100
  )::text,
  true
);

select public.finance_update_invoice_draft(
  current_setting('qa.p95.invoice')::uuid,
  'QA P9.5 completed work',
  '[{"description":"QA P9.5 work","quantity":1,"unit_price":100,"warranty_days":1,"warranty_terms":"QA"}]'::jsonb
);

select public.finance_set_invoice_status(
  current_setting('qa.p95.invoice')::uuid,
  'issued'
);

do $$
declare s jsonb;
begin
  if (select count(*) from public.service_request_payments
      where id=current_setting('qa.p95.receipt')::uuid
        and transferred_invoice_payment_id is not null)<>1 then
    raise exception 'P95_TRANSFER_LINK_MISSING';
  end if;

  if (select count(*) from public.invoice_payments
      where invoice_id=current_setting('qa.p95.invoice')::uuid
        and voided_at is null)<>1 then
    raise exception 'P95_TRANSFER_ALIAS_COUNT_FAILED';
  end if;

  s:=private.payment_financial_state(current_setting('qa.p95.req')::uuid);
  if (s->>'gross_receipts')::numeric<>100 then
    raise exception 'P95_TRANSFER_DOUBLE_COUNT_%',s;
  end if;
end $$;

select set_config(
  'qa.p95.refund',
  public.finance_request_refund(
    current_setting('qa.p95.req')::uuid,
    current_setting('qa.p95.receipt')::uuid,
    null,
    20,
    'QA P9.5 refund',
    'qa-p95-refund',
    ''
  )::text,
  true
);

select public.finance_decide_refund(
  current_setting('qa.p95.refund')::uuid,
  'approved'
);

select public.gateway_start_refund(
  current_setting('qa.p95.refund')::uuid,
  'qa-p95-refund-provider'
);

select public.gateway_apply_verified_refund_result(
  current_setting('qa.p95.refund')::uuid,
  'qa-p95-refund-provider',
  'succeeded',
  null
);

do $$
declare s jsonb; r jsonb;
begin
  s:=private.payment_financial_state(current_setting('qa.p95.req')::uuid);
  if (s->>'gross_receipts')::numeric<>100
     or (s->>'succeeded_refunds')::numeric<>20
     or (s->>'net_receipts')::numeric<>80
     or (s->>'remaining_contractual')::numeric<>20
     or (s->>'payable_now')::numeric<>20 then
    raise exception 'P95_REFUND_REOPEN_FAILED_%',s;
  end if;

  r:=public.finance_get_canonical_report(null,null);
  if (r->'current_position'->>'gross_receipts')::numeric<>100
     or (r->'current_position'->>'succeeded_refunds')::numeric<>20
     or (r->'current_position'->>'net_receipts')::numeric<>80 then
    raise exception 'P95_REPORT_AFTER_REFUND_FAILED_%',r;
  end if;
end $$;

select set_config(
  'request.jwt.claim.sub',
  'bc3e11cc-1a2f-4fc8-a22d-28e04cacc506',
  true
);

select set_config(
  'qa.p95.collection',
  public.technician_record_collection(
    current_setting('qa.p95.req')::uuid,
    'cash',
    20,
    'qa-p95-tech-20',
    'QA P9.5 recollection',
    now()
  )::text,
  true
);

select set_config(
  'request.jwt.claim.sub',
  '37d28ad8-e850-4861-8dd5-95deba60d5fd',
  true
);

select set_config(
  'qa.p95.tech_receipt',
  public.finance_settle_technician_cash_collection(
    current_setting('qa.p95.collection')::uuid,
    'qa-p95-settle'
  )::text,
  true
);

do $$
declare s jsonb; r jsonb;
begin
  s:=private.payment_financial_state(current_setting('qa.p95.req')::uuid);

  if (s->>'gross_receipts')::numeric<>120
     or (s->>'succeeded_refunds')::numeric<>20
     or (s->>'net_receipts')::numeric<>100
     or (s->>'technician_cash_custody')::numeric<>0
     or (s->>'remaining_contractual')::numeric<>0
     or (s->>'excess_refund_liability')::numeric<>0 then
    raise exception 'P95_FINAL_STATE_FAILED_%',s;
  end if;

  if (select count(*) from public.invoice_payments
      where invoice_id=current_setting('qa.p95.invoice')::uuid
        and voided_at is null)<>2 then
    raise exception 'P95_INVOICE_RECEIPT_COUNT_FAILED';
  end if;

  if (select count(*) from public.service_request_payments
      where service_request_id=current_setting('qa.p95.req')::uuid
        and voided_at is null)<>1 then
    raise exception 'P95_CANONICAL_REQUEST_RECEIPT_COUNT_FAILED';
  end if;

  r:=public.finance_get_canonical_report(null,null);
  if (r->'current_position'->>'gross_receipts')::numeric<>120
     or (r->'current_position'->>'succeeded_refunds')::numeric<>20
     or (r->'current_position'->>'net_receipts')::numeric<>100
     or (r->'current_position'->>'contractual_outstanding')::numeric<>0 then
    raise exception 'P95_FINAL_REPORT_FAILED_%',r;
  end if;
end $$;

select jsonb_build_object(
  'gross_receipts',
    (private.payment_financial_state(current_setting('qa.p95.req')::uuid)->>'gross_receipts')::numeric,
  'succeeded_refunds',
    (private.payment_financial_state(current_setting('qa.p95.req')::uuid)->>'succeeded_refunds')::numeric,
  'net_receipts',
    (private.payment_financial_state(current_setting('qa.p95.req')::uuid)->>'net_receipts')::numeric,
  'remaining_contractual',
    (private.payment_financial_state(current_setting('qa.p95.req')::uuid)->>'remaining_contractual')::numeric,
  'request_receipts',
    (select count(*) from public.service_request_payments
     where service_request_id=current_setting('qa.p95.req')::uuid and voided_at is null),
  'invoice_receipts',
    (select count(*) from public.invoice_payments
     where invoice_id=current_setting('qa.p95.invoice')::uuid and voided_at is null),
  'technician_collection_status',
    (select status from public.technician_collections
     where id=current_setting('qa.p95.collection')::uuid)
) as phase9_p95_result;

rollback;
