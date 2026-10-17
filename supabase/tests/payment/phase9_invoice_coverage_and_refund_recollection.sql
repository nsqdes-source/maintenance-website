-- Focused regression for secure invoice coverage + refund-aware recollection.
-- Payment Test only. Must rollback.
begin;

do $$
begin
  if has_table_privilege('authenticated','public.payment_refunds','SELECT') then
    raise exception 'HARDENING_REFUNDS_DIRECT_SELECT_UNEXPECTED';
  end if;
  if not has_function_privilege('authenticated','public.finance_get_invoice_financial_coverage()','EXECUTE') then
    raise exception 'HARDENING_COVERAGE_RPC_AUTH_MISSING';
  end if;
  if has_function_privilege('anon','public.finance_get_invoice_financial_coverage()','EXECUTE')
     or has_function_privilege('service_role','public.finance_get_invoice_financial_coverage()','EXECUTE') then
    raise exception 'HARDENING_COVERAGE_RPC_ACL_FAILED';
  end if;
end $$;

insert into public.business_finance_settings(
  id,legal_name,address,contact_email,tax_number,vat_registered,tax_rate,currency,
  payment_domain_enabled,gateway_enabled,gateway_provider,gateway_environment
) values (
  true,'QA Recollection','QA','qa-recollection@example.com','',false,0,'SAR',
  true,true,'qa_gateway','test'
);

insert into public.service_requests(
  customer_name,phone,service_type,problem_description,city,address,
  customer_email,payment_choice_timing,payment_policy_snapshot
) values (
  'QA Refund Recollection','0500000199','QA','QA','Makkah','QA','qa-recollection@example.com',
  'prepay',
  jsonb_build_object(
    'version',1,
    'policy',(select payment_policy from public.business_finance_settings where id=true)
  )
);

select set_config(
  'qa.hard.req',
  (select id::text from public.service_requests
   where customer_name='QA Refund Recollection'
   order by created_at desc limit 1),
  true
);

insert into public.service_request_items(
  service_request_id,catalog_service_id,service_name,quantity,
  net_unit_price,tax_rate,gross_unit_price,item_source
) values (
  current_setting('qa.hard.req')::uuid,
  '2b4925a8-35ed-4378-99a2-f4a5045ed36a'::uuid,
  'QA Refund Recollection Service',1,100,0,100,'customer_request'
);

select set_config('request.jwt.claim.sub','37d28ad8-e850-4861-8dd5-95deba60d5fd',true);

select set_config(
  'qa.hard.attempt1',
  private.payment_create_authoritative_attempt(
    current_setting('qa.hard.req')::uuid,'qa_gateway','test','qa-hard-attempt-1'
  )::text,true
);

select set_config(
  'qa.hard.event1',
  private.payment_record_provider_event(
    'qa_gateway','test','qa-hard-event-1','payment.succeeded',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    current_setting('qa.hard.attempt1')::uuid,'qa-hard-txn-1','{}'::jsonb
  )::text,true
);

select private.payment_apply_verified_provider_result(
  current_setting('qa.hard.event1')::uuid,'succeeded','qa-hard-txn-1',100,'SAR',null
);

select set_config(
  'qa.hard.receipt1',
  private.payment_post_verified_attempt(
    current_setting('qa.hard.attempt1')::uuid,'qa-hard-post-1'
  )::text,true
);

update public.service_requests
set workflow_stage='completed'
where id=current_setting('qa.hard.req')::uuid;

select set_config(
  'qa.hard.invoice',
  public.finance_create_invoice(
    current_setting('qa.hard.req')::uuid,'QA refund recollection invoice',100
  )::text,true
);

select public.finance_update_invoice_draft(
  current_setting('qa.hard.invoice')::uuid,
  'QA completed work',
  '[{"description":"QA work","quantity":1,"unit_price":100,"warranty_days":1,"warranty_terms":"QA"}]'::jsonb
);

select public.finance_set_invoice_status(current_setting('qa.hard.invoice')::uuid,'issued');

select set_config(
  'qa.hard.refund',
  public.finance_request_refund(
    current_setting('qa.hard.req')::uuid,
    current_setting('qa.hard.receipt1')::uuid,
    null,20,'QA refund','qa-hard-refund',''
  )::text,true
);

select public.finance_decide_refund(current_setting('qa.hard.refund')::uuid,'approved');
select public.gateway_start_refund(current_setting('qa.hard.refund')::uuid,'qa-hard-provider-refund');
select public.gateway_apply_verified_refund_result(
  current_setting('qa.hard.refund')::uuid,'qa-hard-provider-refund','succeeded',null
);

do $$
declare c record; s jsonb;
begin
  s:=private.payment_financial_state(current_setting('qa.hard.req')::uuid);
  if (s->>'payable_now')::numeric<>20 then
    raise exception 'HARDENING_REFUND_DID_NOT_REOPEN_20_%',s;
  end if;

  if (select paid_at from public.invoices where id=current_setting('qa.hard.invoice')::uuid) is not null then
    raise exception 'HARDENING_PAID_AT_NOT_CLEARED_AFTER_REFUND';
  end if;

  select * into c
  from public.finance_get_invoice_financial_coverage()
  where invoice_id=current_setting('qa.hard.invoice')::uuid;

  if c.gross_received<>100 or c.succeeded_refunds<>20
     or c.net_received<>80 or c.remaining<>20 or c.is_fully_covered then
    raise exception 'HARDENING_COVERAGE_AFTER_REFUND_FAILED_%',to_jsonb(c);
  end if;
end $$;

select set_config(
  'qa.hard.attempt2',
  private.payment_create_authoritative_attempt(
    current_setting('qa.hard.req')::uuid,'qa_gateway','test','qa-hard-attempt-2'
  )::text,true
);

select set_config(
  'qa.hard.event2',
  private.payment_record_provider_event(
    'qa_gateway','test','qa-hard-event-2','payment.succeeded',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    current_setting('qa.hard.attempt2')::uuid,'qa-hard-txn-2','{}'::jsonb
  )::text,true
);

select private.payment_apply_verified_provider_result(
  current_setting('qa.hard.event2')::uuid,'succeeded','qa-hard-txn-2',20,'SAR',null
);

select set_config(
  'qa.hard.receipt2',
  private.payment_post_verified_attempt(
    current_setting('qa.hard.attempt2')::uuid,'qa-hard-post-2'
  )::text,true
);

do $$
declare c record; s jsonb;
begin
  s:=private.payment_financial_state(current_setting('qa.hard.req')::uuid);

  if (s->>'gross_receipts')::numeric<>120
     or (s->>'succeeded_refunds')::numeric<>20
     or (s->>'net_receipts')::numeric<>100
     or (s->>'remaining_contractual')::numeric<>0 then
    raise exception 'HARDENING_RECOLLECTION_STATE_FAILED_%',s;
  end if;

  if (select count(*) from public.invoice_payments
      where invoice_id=current_setting('qa.hard.invoice')::uuid and voided_at is null)<>2 then
    raise exception 'HARDENING_EXPECTED_TWO_ACTIVE_INVOICE_RECEIPTS';
  end if;

  if (select paid_at from public.invoices where id=current_setting('qa.hard.invoice')::uuid) is null then
    raise exception 'HARDENING_PAID_AT_NOT_RESTORED';
  end if;

  select * into c
  from public.finance_get_invoice_financial_coverage()
  where invoice_id=current_setting('qa.hard.invoice')::uuid;

  if c.gross_received<>120 or c.succeeded_refunds<>20
     or c.net_received<>100 or c.remaining<>0 or not c.is_fully_covered then
    raise exception 'HARDENING_COVERAGE_AFTER_RECOLLECTION_FAILED_%',to_jsonb(c);
  end if;
end $$;

select set_config('request.jwt.claim.sub','bc3e11cc-1a2f-4fc8-a22d-28e04cacc506',true);

do $$
begin
  begin
    perform public.finance_get_invoice_financial_coverage();
    raise exception 'HARDENING_TECH_CAN_CALL_COVERAGE';
  exception when insufficient_privilege then
    null;
  end;
end $$;

select jsonb_build_object(
  'direct_refund_select','denied',
  'finance_coverage_rpc','pass',
  'refund_reopened_balance',20,
  'recollection_posted',20,
  'final_net',100,
  'paid_at_restored',true,
  'technician_coverage_access','denied'
) as hardening_result;

rollback;
