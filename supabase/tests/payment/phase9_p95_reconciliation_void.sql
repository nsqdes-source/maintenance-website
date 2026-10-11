-- Phase 9 P9.5 supplemental reconciliation + void regression
-- PAYMENT TEST ONLY. Self-contained. Must end with ROLLBACK.

begin;

insert into public.business_finance_settings(
  id,legal_name,address,contact_email,tax_number,vat_registered,tax_rate,currency,
  payment_domain_enabled,gateway_enabled,gateway_provider,gateway_environment
) values (
  true,'QA P9.5 Supplemental','QA','qa-p95s@example.com','',false,0,'SAR',
  true,true,'qa_gateway','test'
);

select set_config(
  'request.jwt.claim.sub',
  '37d28ad8-e850-4861-8dd5-95deba60d5fd',
  true
);

-- Scenario C: provider mismatch must remain in reconciliation with no receipt.
insert into public.service_requests(
  customer_name,phone,service_type,problem_description,city,address,
  customer_email,payment_choice_timing,payment_policy_snapshot
) values (
  'QA P9.5 Reconciliation','0500000195','QA','QA','Makkah','QA','qa@example.com','prepay',
  jsonb_build_object('version',1,'policy',
    (select payment_policy from public.business_finance_settings where id=true))
);

select set_config(
  'qa.p95s.recon_req',
  (select id::text from public.service_requests
   where customer_name='QA P9.5 Reconciliation'
   order by created_at desc limit 1),
  true
);

insert into public.service_request_items(
  service_request_id,catalog_service_id,service_name,quantity,
  net_unit_price,tax_rate,gross_unit_price,item_source
) values (
  current_setting('qa.p95s.recon_req')::uuid,
  '2b4925a8-35ed-4378-99a2-f4a5045ed36a'::uuid,
  'QA Recon',1,30,0,30,'customer_request'
);

select set_config(
  'qa.p95s.recon_attempt',
  private.payment_create_authoritative_attempt(
    current_setting('qa.p95s.recon_req')::uuid,
    'qa_gateway','test','qa-p95s-recon-attempt'
  )::text,
  true
);

select set_config(
  'qa.p95s.recon_event',
  private.payment_record_provider_event(
    'qa_gateway','test','qa-p95s-recon-event','payment.succeeded',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    current_setting('qa.p95s.recon_attempt')::uuid,
    'qa-p95s-recon-txn','{}'::jsonb
  )::text,
  true
);

select set_config(
  'qa.p95s.recon_result',
  private.payment_apply_verified_provider_result(
    current_setting('qa.p95s.recon_event')::uuid,
    'succeeded','qa-p95s-recon-txn',29,'SAR',null
  ),
  true
);

do $$
declare s jsonb;
begin
  if current_setting('qa.p95s.recon_result')<>'reconciliation_required' then
    raise exception 'P95S_RECON_RESULT_FAILED';
  end if;

  if (select status from public.payment_attempts
      where id=current_setting('qa.p95s.recon_attempt')::uuid)<>'requires_reconciliation' then
    raise exception 'P95S_RECON_STATUS_FAILED';
  end if;

  if (select count(*) from public.service_request_payments
      where service_request_id=current_setting('qa.p95s.recon_req')::uuid
        and voided_at is null)<>0 then
    raise exception 'P95S_RECON_CREATED_RECEIPT';
  end if;

  s:=private.payment_financial_state(current_setting('qa.p95s.recon_req')::uuid);
  if not coalesce((s->>'reconciliation_required')::boolean,false) then
    raise exception 'P95S_RECON_FLAG_MISSING_%',s;
  end if;
end $$;

-- Scenario D: void removes active money without rewriting provider history.
insert into public.service_requests(
  customer_name,phone,service_type,problem_description,city,address,
  customer_email,payment_choice_timing,payment_policy_snapshot
) values (
  'QA P9.5 Void','0500000295','QA','QA','Makkah','QA','qa@example.com','prepay',
  jsonb_build_object('version',1,'policy',
    (select payment_policy from public.business_finance_settings where id=true))
);

select set_config(
  'qa.p95s.void_req',
  (select id::text from public.service_requests
   where customer_name='QA P9.5 Void'
   order by created_at desc limit 1),
  true
);

insert into public.service_request_items(
  service_request_id,catalog_service_id,service_name,quantity,
  net_unit_price,tax_rate,gross_unit_price,item_source
) values (
  current_setting('qa.p95s.void_req')::uuid,
  '2b4925a8-35ed-4378-99a2-f4a5045ed36a'::uuid,
  'QA Void',1,10,0,10,'customer_request'
);

select set_config(
  'qa.p95s.void_attempt',
  private.payment_create_authoritative_attempt(
    current_setting('qa.p95s.void_req')::uuid,
    'qa_gateway','test','qa-p95s-void-attempt'
  )::text,
  true
);

select set_config(
  'qa.p95s.void_event',
  private.payment_record_provider_event(
    'qa_gateway','test','qa-p95s-void-event','payment.succeeded',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    current_setting('qa.p95s.void_attempt')::uuid,
    'qa-p95s-void-txn','{}'::jsonb
  )::text,
  true
);

select private.payment_apply_verified_provider_result(
  current_setting('qa.p95s.void_event')::uuid,
  'succeeded','qa-p95s-void-txn',10,'SAR',null
);

select set_config(
  'qa.p95s.void_receipt',
  private.payment_post_verified_attempt(
    current_setting('qa.p95s.void_attempt')::uuid,
    'qa-p95s-void-post'
  )::text,
  true
);

select public.finance_void_service_request_payment(
  current_setting('qa.p95s.void_receipt')::uuid
);

do $$
declare s jsonb;
begin
  if (select status from public.payment_attempts
      where id=current_setting('qa.p95s.void_attempt')::uuid)<>'succeeded' then
    raise exception 'P95S_VOID_REWROTE_PROVIDER_HISTORY';
  end if;

  if (select voided_at is null from public.service_request_payments
      where id=current_setting('qa.p95s.void_receipt')::uuid) then
    raise exception 'P95S_VOID_RECEIPT_STILL_ACTIVE';
  end if;

  s:=private.payment_financial_state(current_setting('qa.p95s.void_req')::uuid);
  if (s->>'gross_receipts')::numeric<>0
     or (s->>'net_receipts')::numeric<>0
     or (s->>'remaining_contractual')::numeric<>10 then
    raise exception 'P95S_VOID_STATE_FAILED_%',s;
  end if;
end $$;

select jsonb_build_object(
  'reconciliation_result',current_setting('qa.p95s.recon_result'),
  'reconciliation_status',
    (select status from public.payment_attempts
     where id=current_setting('qa.p95s.recon_attempt')::uuid),
  'reconciliation_receipts',
    (select count(*) from public.service_request_payments
     where service_request_id=current_setting('qa.p95s.recon_req')::uuid
       and voided_at is null),
  'void_attempt_status',
    (select status from public.payment_attempts
     where id=current_setting('qa.p95s.void_attempt')::uuid),
  'void_receipt_active',
    (select voided_at is null from public.service_request_payments
     where id=current_setting('qa.p95s.void_receipt')::uuid),
  'void_gross',
    (private.payment_financial_state(current_setting('qa.p95s.void_req')::uuid)->>'gross_receipts')::numeric,
  'void_remaining',
    (private.payment_financial_state(current_setting('qa.p95s.void_req')::uuid)->>'remaining_contractual')::numeric
) as phase9_p95_supplemental_result;

rollback;
