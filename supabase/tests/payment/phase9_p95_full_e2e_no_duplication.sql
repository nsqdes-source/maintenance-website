-- Phase 9 P9.5 full E2E / no-duplication regression
-- PAYMENT TEST ONLY. Self-contained. Must end with ROLLBACK.
--
-- Scenario A: provider payment -> canonical request receipt -> invoice transfer ->
-- successful refund -> reopened payable balance.
--
-- Scenario B: separate operational request with accepted assignment ->
-- technician cash collection -> finance settlement.
--
-- The scenarios are intentionally separate because completing a request closes
-- its operational assignments. The regression must not weaken that workflow rule.

begin;

insert into public.business_finance_settings(
  id,legal_name,address,contact_email,tax_number,vat_registered,tax_rate,currency,
  payment_domain_enabled,gateway_enabled,gateway_provider,gateway_environment
) values (
  true,'QA P9.5','QA','qa-p95@example.com','',false,0,'SAR',
  true,true,'qa_gateway','test'
);

-- ============================================================
-- Scenario A — provider payment, transfer, refund
-- ============================================================

insert into public.service_requests(
  customer_name,phone,service_type,problem_description,city,address,
  customer_email,payment_choice_timing,payment_policy_snapshot
) values (
  'QA P9.5 Gateway','0500000095','QA','QA','Makkah','QA','qa-p95@example.com',
  'prepay',
  jsonb_build_object(
    'version',1,
    'policy',(select payment_policy from public.business_finance_settings where id=true)
  )
);

select set_config(
  'qa.p95.gateway_req',
  (select id::text from public.service_requests
   where customer_name='QA P9.5 Gateway'
   order by created_at desc limit 1),
  true
);

insert into public.service_request_items(
  service_request_id,catalog_service_id,service_name,quantity,
  net_unit_price,tax_rate,gross_unit_price,item_source
) values (
  current_setting('qa.p95.gateway_req')::uuid,
  '2b4925a8-35ed-4378-99a2-f4a5045ed36a'::uuid,
  'QA P9.5 Gateway Service',1,100,0,100,'customer_request'
);

select set_config(
  'request.jwt.claim.sub',
  '37d28ad8-e850-4861-8dd5-95deba60d5fd',
  true
);

select set_config(
  'qa.p95.attempt',
  private.payment_create_authoritative_attempt(
    current_setting('qa.p95.gateway_req')::uuid,
    'qa_gateway',
    'test',
    'qa-p95-attempt'
  )::text,
  true
);

do $$
declare s jsonb;
begin
  s:=private.payment_financial_state(current_setting('qa.p95.gateway_req')::uuid);
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
  'succeeded','qa-p95-txn',100,'SAR',null
);

select set_config(
  'qa.p95.gateway_receipt',
  private.payment_post_verified_attempt(
    current_setting('qa.p95.attempt')::uuid,
    'qa-p95-post'
  )::text,
  true
);

do $$
declare receipt_again uuid; s jsonb;
begin
  receipt_again:=private.payment_post_verified_attempt(
    current_setting('qa.p95.attempt')::uuid,
    'qa-p95-post'
  );

  if receipt_again<>current_setting('qa.p95.gateway_receipt')::uuid then
    raise exception 'P95_PROVIDER_POST_IDEMPOTENCY_FAILED';
  end if;

  if (select count(*) from public.service_request_payments
      where service_request_id=current_setting('qa.p95.gateway_req')::uuid
        and voided_at is null)<>1 then
    raise exception 'P95_PROVIDER_DUPLICATE_RECEIPT';
  end if;

  s:=private.payment_financial_state(current_setting('qa.p95.gateway_req')::uuid);
  if (s->>'gross_receipts')::numeric<>100
     or (s->>'net_receipts')::numeric<>100
     or (s->>'remaining_contractual')::numeric<>0 then
    raise exception 'P95_PROVIDER_RECEIPT_STATE_FAILED_%',s;
  end if;
end $$;

update public.service_requests
set workflow_stage='completed'
where id=current_setting('qa.p95.gateway_req')::uuid;

select set_config(
  'qa.p95.invoice',
  public.finance_create_invoice(
    current_setting('qa.p95.gateway_req')::uuid,
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
      where id=current_setting('qa.p95.gateway_receipt')::uuid
        and transferred_invoice_payment_id is not null)<>1 then
    raise exception 'P95_TRANSFER_LINK_MISSING';
  end if;

  if (select count(*) from public.invoice_payments
      where invoice_id=current_setting('qa.p95.invoice')::uuid
        and voided_at is null)<>1 then
    raise exception 'P95_TRANSFER_ALIAS_COUNT_FAILED';
  end if;

  s:=private.payment_financial_state(current_setting('qa.p95.gateway_req')::uuid);
  if (s->>'gross_receipts')::numeric<>100 then
    raise exception 'P95_TRANSFER_DOUBLE_COUNT_%',s;
  end if;
end $$;

select set_config(
  'qa.p95.refund',
  public.finance_request_refund(
    current_setting('qa.p95.gateway_req')::uuid,
    current_setting('qa.p95.gateway_receipt')::uuid,
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
declare s jsonb;
begin
  s:=private.payment_financial_state(current_setting('qa.p95.gateway_req')::uuid);

  if (s->>'gross_receipts')::numeric<>100
     or (s->>'succeeded_refunds')::numeric<>20
     or (s->>'net_receipts')::numeric<>80
     or (s->>'remaining_contractual')::numeric<>20
     or (s->>'payable_now')::numeric<>20 then
    raise exception 'P95_REFUND_REOPEN_FAILED_%',s;
  end if;
end $$;

-- ============================================================
-- Scenario B — operational technician collection and settlement
-- ============================================================

insert into public.service_requests(
  customer_name,phone,service_type,problem_description,city,address,
  customer_email,payment_choice_timing,payment_policy_snapshot
) values (
  'QA P9.5 Technician','0500000096','QA','QA','Makkah','QA','qa-p95-tech@example.com',
  'prepay',
  jsonb_build_object(
    'version',1,
    'policy',(select payment_policy from public.business_finance_settings where id=true)
  )
);

select set_config(
  'qa.p95.tech_req',
  (select id::text from public.service_requests
   where customer_name='QA P9.5 Technician'
   order by created_at desc limit 1),
  true
);

insert into public.service_request_items(
  service_request_id,catalog_service_id,service_name,quantity,
  net_unit_price,tax_rate,gross_unit_price,item_source
) values (
  current_setting('qa.p95.tech_req')::uuid,
  '2b4925a8-35ed-4378-99a2-f4a5045ed36a'::uuid,
  'QA P9.5 Technician Service',1,20,0,20,'customer_request'
);

insert into public.service_request_assignments(
  service_request_id,technician_id,assigned_by,status,responded_at,notes
) values (
  current_setting('qa.p95.tech_req')::uuid,
  'e115b07d-1d76-43b4-8d0e-b42622bf5f22'::uuid,
  '37d28ad8-e850-4861-8dd5-95deba60d5fd'::uuid,
  'accepted',now(),'QA P9.5 technician accepted'
);

select set_config(
  'request.jwt.claim.sub',
  'bc3e11cc-1a2f-4fc8-a22d-28e04cacc506',
  true
);

select set_config(
  'qa.p95.collection',
  public.technician_record_collection(
    current_setting('qa.p95.tech_req')::uuid,
    'cash',
    20,
    'qa-p95-tech-20',
    'QA P9.5 collection',
    now()
  )::text,
  true
);

do $$
declare s jsonb;
begin
  s:=private.payment_financial_state(current_setting('qa.p95.tech_req')::uuid);

  if (s->>'technician_cash_custody')::numeric<>20
     or (s->>'payable_cap')::numeric<>0
     or (s->>'payable_now')::numeric<>0 then
    raise exception 'P95_TECH_CUSTODY_STATE_FAILED_%',s;
  end if;
end $$;

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
declare
  settled_again uuid;
  s_gateway jsonb;
  s_tech jsonb;
  report jsonb;
begin
  settled_again:=public.finance_settle_technician_cash_collection(
    current_setting('qa.p95.collection')::uuid,
    'qa-p95-settle'
  );

  if settled_again<>current_setting('qa.p95.tech_receipt')::uuid then
    raise exception 'P95_TECH_SETTLEMENT_IDEMPOTENCY_FAILED';
  end if;

  s_gateway:=private.payment_financial_state(current_setting('qa.p95.gateway_req')::uuid);
  s_tech:=private.payment_financial_state(current_setting('qa.p95.tech_req')::uuid);

  if (s_gateway->>'gross_receipts')::numeric<>100
     or (s_gateway->>'succeeded_refunds')::numeric<>20
     or (s_gateway->>'net_receipts')::numeric<>80
     or (s_gateway->>'remaining_contractual')::numeric<>20 then
    raise exception 'P95_GATEWAY_FINAL_STATE_FAILED_%',s_gateway;
  end if;

  if (s_tech->>'gross_receipts')::numeric<>20
     or (s_tech->>'net_receipts')::numeric<>20
     or (s_tech->>'technician_cash_custody')::numeric<>0
     or (s_tech->>'remaining_contractual')::numeric<>0 then
    raise exception 'P95_TECH_FINAL_STATE_FAILED_%',s_tech;
  end if;

  if (select count(*) from public.service_request_payments
      where service_request_id=current_setting('qa.p95.gateway_req')::uuid
        and voided_at is null)<>1 then
    raise exception 'P95_GATEWAY_CANONICAL_RECEIPT_COUNT_FAILED';
  end if;

  if (select count(*) from public.invoice_payments
      where invoice_id=current_setting('qa.p95.invoice')::uuid
        and voided_at is null)<>1 then
    raise exception 'P95_GATEWAY_ALIAS_COUNT_CHANGED';
  end if;

  if (select count(*) from public.service_request_payments
      where service_request_id=current_setting('qa.p95.tech_req')::uuid
        and voided_at is null)<>1 then
    raise exception 'P95_TECH_RECEIPT_COUNT_FAILED';
  end if;

  report:=public.finance_get_canonical_report(null,null);

  if (report->'current_position'->>'gross_receipts')::numeric<>120
     or (report->'current_position'->>'succeeded_refunds')::numeric<>20
     or (report->'current_position'->>'net_receipts')::numeric<>100
     or (report->'current_position'->>'technician_cash_custody')::numeric<>0
     or (report->'current_position'->>'contractual_outstanding')::numeric<>20 then
    raise exception 'P95_FINAL_REPORT_FAILED_%',report;
  end if;
end $$;

select jsonb_build_object(
  'gateway_gross',
    (private.payment_financial_state(current_setting('qa.p95.gateway_req')::uuid)->>'gross_receipts')::numeric,
  'gateway_refunds',
    (private.payment_financial_state(current_setting('qa.p95.gateway_req')::uuid)->>'succeeded_refunds')::numeric,
  'gateway_net',
    (private.payment_financial_state(current_setting('qa.p95.gateway_req')::uuid)->>'net_receipts')::numeric,
  'gateway_remaining',
    (private.payment_financial_state(current_setting('qa.p95.gateway_req')::uuid)->>'remaining_contractual')::numeric,
  'technician_gross',
    (private.payment_financial_state(current_setting('qa.p95.tech_req')::uuid)->>'gross_receipts')::numeric,
  'technician_net',
    (private.payment_financial_state(current_setting('qa.p95.tech_req')::uuid)->>'net_receipts')::numeric,
  'technician_custody',
    (private.payment_financial_state(current_setting('qa.p95.tech_req')::uuid)->>'technician_cash_custody')::numeric,
  'report_gross',
    (public.finance_get_canonical_report(null,null)->'current_position'->>'gross_receipts')::numeric,
  'report_refunds',
    (public.finance_get_canonical_report(null,null)->'current_position'->>'succeeded_refunds')::numeric,
  'report_net',
    (public.finance_get_canonical_report(null,null)->'current_position'->>'net_receipts')::numeric,
  'report_outstanding',
    (public.finance_get_canonical_report(null,null)->'current_position'->>'contractual_outstanding')::numeric,
  'gateway_request_receipts',
    (select count(*) from public.service_request_payments
     where service_request_id=current_setting('qa.p95.gateway_req')::uuid and voided_at is null),
  'gateway_invoice_aliases',
    (select count(*) from public.invoice_payments
     where invoice_id=current_setting('qa.p95.invoice')::uuid and voided_at is null),
  'technician_request_receipts',
    (select count(*) from public.service_request_payments
     where service_request_id=current_setting('qa.p95.tech_req')::uuid and voided_at is null),
  'technician_collection_status',
    (select status from public.technician_collections
     where id=current_setting('qa.p95.collection')::uuid)
) as phase9_p95_result;

rollback;
