-- Phase 8 R5 final refund regression & financial correctness
-- Payment Test only. Self-contained and ends with ROLLBACK.

begin;

insert into public.business_finance_settings(
  id,legal_name,address,contact_email,tax_number,vat_registered,tax_rate,currency,
  payment_domain_enabled,gateway_enabled
) values (
  true,'QA Phase 8 R5','QA Address','qa@example.com','',false,0,'SAR',false,false
);

set local "request.jwt.claim.sub"='37d28ad8-e850-4861-8dd5-95deba60d5fd';

-- ============================================================
-- CASE A: Excess refund correctness
-- Charge = 30, original receipt = 50, successful refund = 20.
-- Expected final net receipts = 30 and excess liability = 0.
-- ============================================================

insert into public.service_requests(
  customer_name,phone,service_type,problem_description,city,address,
  customer_email,payment_choice_timing
) values (
  'QA R5 Excess','0500000001','QA','QA','Makkah','QA',
  'qa-r5-excess@example.com','prepay'
);

select set_config(
  'qa.r5.req_excess',
  (
    select id::text from public.service_requests
    where customer_name='QA R5 Excess'
    order by created_at desc limit 1
  ),
  true
);

insert into public.service_request_items(
  service_request_id,catalog_service_id,service_name,quantity,
  net_unit_price,tax_rate,gross_unit_price,item_source
) values (
  current_setting('qa.r5.req_excess')::uuid,
  '2b4925a8-35ed-4378-99a2-f4a5045ed36a'::uuid,
  'QA R5 Excess Service',1,30,0,30,'customer_request'
);

select set_config(
  'qa.r5.pay_excess',
  public.finance_record_service_request_payment(
    current_setting('qa.r5.req_excess')::uuid,
    50,'advance','cash','QA R5 excess original payment'
  )::text,
  true
);

do $$
declare s jsonb;
begin
  s:=private.payment_financial_state(current_setting('qa.r5.req_excess')::uuid);

  if (s->>'authoritative_charge')::numeric<>30 then
    raise exception 'R5_A_CHARGE_EXPECTED_30_GOT_%',s->>'authoritative_charge';
  end if;
  if (s->>'gross_receipts')::numeric<>50 then
    raise exception 'R5_A_GROSS_EXPECTED_50_GOT_%',s->>'gross_receipts';
  end if;
  if (s->>'net_receipts')::numeric<>50 then
    raise exception 'R5_A_NET_BEFORE_EXPECTED_50_GOT_%',s->>'net_receipts';
  end if;
  if (s->>'excess_refund_liability')::numeric<>20 then
    raise exception 'R5_A_EXCESS_BEFORE_EXPECTED_20_GOT_%',s->>'excess_refund_liability';
  end if;
end $$;

select set_config(
  'qa.r5.ref_excess',
  public.finance_request_refund(
    current_setting('qa.r5.req_excess')::uuid,
    current_setting('qa.r5.pay_excess')::uuid,
    null,
    20,
    'QA excess refund',
    'phase8-r5-excess-refund',
    ''
  )::text,
  true
);

-- Same request is idempotent.
do $$
declare a uuid; b uuid;
begin
  a:=current_setting('qa.r5.ref_excess')::uuid;
  b:=public.finance_request_refund(
    current_setting('qa.r5.req_excess')::uuid,
    current_setting('qa.r5.pay_excess')::uuid,
    null,
    20,
    'QA excess refund',
    'phase8-r5-excess-refund',
    ''
  );
  if a<>b then
    raise exception 'R5_A_IDEMPOTENCY_FAILED';
  end if;
end $$;

-- Requested does not reserve refundable balance.
do $$
declare a jsonb; p jsonb;
begin
  a:=public.finance_get_refund_availability(current_setting('qa.r5.req_excess')::uuid);
  p:=a->'payments'->0;
  if (p->>'requested_refund_total')::numeric<>20 then
    raise exception 'R5_A_REQUESTED_TOTAL_EXPECTED_20_GOT_%',p->>'requested_refund_total';
  end if;
  if (p->>'active_refund_reservation_total')::numeric<>0 then
    raise exception 'R5_A_ACTIVE_BEFORE_APPROVAL_EXPECTED_0_GOT_%',p->>'active_refund_reservation_total';
  end if;
  if (p->>'refundable_remaining_amount')::numeric<>50 then
    raise exception 'R5_A_REQUESTED_MUST_NOT_RESERVE_EXPECTED_50_GOT_%',p->>'refundable_remaining_amount';
  end if;
end $$;

select public.finance_decide_refund(
  current_setting('qa.r5.ref_excess')::uuid,
  'approved'
);

-- Approved reserves but does not reduce net receipts.
do $$
declare a jsonb; p jsonb; s jsonb;
begin
  a:=public.finance_get_refund_availability(current_setting('qa.r5.req_excess')::uuid);
  p:=a->'payments'->0;
  s:=private.payment_financial_state(current_setting('qa.r5.req_excess')::uuid);

  if (p->>'active_refund_reservation_total')::numeric<>20 then
    raise exception 'R5_A_ACTIVE_APPROVED_EXPECTED_20_GOT_%',p->>'active_refund_reservation_total';
  end if;
  if (p->>'refundable_remaining_amount')::numeric<>30 then
    raise exception 'R5_A_REMAINING_APPROVED_EXPECTED_30_GOT_%',p->>'refundable_remaining_amount';
  end if;
  if (s->>'net_receipts')::numeric<>50 then
    raise exception 'R5_A_APPROVED_MUST_NOT_REDUCE_NET_GOT_%',s->>'net_receipts';
  end if;
end $$;

select private.payment_transition_refund(
  current_setting('qa.r5.ref_excess')::uuid,
  'pending',
  null,
  null
);

do $$
declare s jsonb;
begin
  s:=private.payment_financial_state(current_setting('qa.r5.req_excess')::uuid);
  if (s->>'net_receipts')::numeric<>50 then
    raise exception 'R5_A_PENDING_MUST_NOT_REDUCE_NET_GOT_%',s->>'net_receipts';
  end if;
end $$;

select private.payment_transition_refund(
  current_setting('qa.r5.ref_excess')::uuid,
  'succeeded',
  null,
  null
);

do $$
declare s jsonb; a jsonb; p jsonb;
begin
  s:=private.payment_financial_state(current_setting('qa.r5.req_excess')::uuid);
  a:=public.finance_get_refund_availability(current_setting('qa.r5.req_excess')::uuid);
  p:=a->'payments'->0;

  if (s->>'gross_receipts')::numeric<>50 then
    raise exception 'R5_A_ORIGINAL_RECEIPT_CHANGED_GROSS_%',s->>'gross_receipts';
  end if;
  if (s->>'succeeded_refunds')::numeric<>20 then
    raise exception 'R5_A_SUCCEEDED_REFUNDS_EXPECTED_20_GOT_%',s->>'succeeded_refunds';
  end if;
  if (s->>'net_receipts')::numeric<>30 then
    raise exception 'R5_A_NET_FINAL_EXPECTED_30_GOT_%',s->>'net_receipts';
  end if;
  if (s->>'excess_refund_liability')::numeric<>0 then
    raise exception 'R5_A_EXCESS_FINAL_EXPECTED_0_GOT_%',s->>'excess_refund_liability';
  end if;
  if (p->>'succeeded_refund_total')::numeric<>20 then
    raise exception 'R5_A_READ_SUCCEEDED_EXPECTED_20_GOT_%',p->>'succeeded_refund_total';
  end if;
  if (p->>'refundable_remaining_amount')::numeric<>30 then
    raise exception 'R5_A_READ_REMAINING_EXPECTED_30_GOT_%',p->>'refundable_remaining_amount';
  end if;
end $$;

-- Over-refund after succeeded refund must be blocked.
do $$
declare blocked boolean:=false;
begin
  begin
    perform public.finance_request_refund(
      current_setting('qa.r5.req_excess')::uuid,
      current_setting('qa.r5.pay_excess')::uuid,
      null,
      31,
      'QA over refund',
      'phase8-r5-over-refund',
      ''
    );
  exception when others then
    if sqlerrm='refund_exceeds_available_balance' then
      blocked:=true;
    else
      raise;
    end if;
  end;

  if not blocked then
    raise exception 'R5_A_OVER_REFUND_NOT_BLOCKED';
  end if;
end $$;

-- ============================================================
-- CASE B: Failed refund does not reduce net receipts.
-- ============================================================

insert into public.service_requests(
  customer_name,phone,service_type,problem_description,city,address,
  customer_email,payment_choice_timing
) values (
  'QA R5 Failed','0500000002','QA','QA','Makkah','QA',
  'qa-r5-failed@example.com','prepay'
);

select set_config(
  'qa.r5.req_failed',
  (
    select id::text from public.service_requests
    where customer_name='QA R5 Failed'
    order by created_at desc limit 1
  ),
  true
);

insert into public.service_request_items(
  service_request_id,catalog_service_id,service_name,quantity,
  net_unit_price,tax_rate,gross_unit_price,item_source
) values (
  current_setting('qa.r5.req_failed')::uuid,
  '2b4925a8-35ed-4378-99a2-f4a5045ed36a'::uuid,
  'QA R5 Failed Service',1,50,0,50,'customer_request'
);

select set_config(
  'qa.r5.pay_failed',
  public.finance_record_service_request_payment(
    current_setting('qa.r5.req_failed')::uuid,
    50,'advance','cash','QA R5 failed original payment'
  )::text,
  true
);

select set_config(
  'qa.r5.ref_failed',
  public.finance_request_refund(
    current_setting('qa.r5.req_failed')::uuid,
    current_setting('qa.r5.pay_failed')::uuid,
    null,
    10,
    'QA failed refund',
    'phase8-r5-failed-refund',
    ''
  )::text,
  true
);

select public.finance_decide_refund(
  current_setting('qa.r5.ref_failed')::uuid,
  'approved'
);

select private.payment_transition_refund(
  current_setting('qa.r5.ref_failed')::uuid,
  'pending',
  null,
  null
);

select private.payment_transition_refund(
  current_setting('qa.r5.ref_failed')::uuid,
  'failed',
  null,
  'qa_failure'
);

do $$
declare s jsonb; a jsonb; p jsonb;
begin
  s:=private.payment_financial_state(current_setting('qa.r5.req_failed')::uuid);
  a:=public.finance_get_refund_availability(current_setting('qa.r5.req_failed')::uuid);
  p:=a->'payments'->0;

  if (s->>'succeeded_refunds')::numeric<>0 then
    raise exception 'R5_B_FAILED_REFUND_COUNTED_AS_SUCCESS_%',s->>'succeeded_refunds';
  end if;
  if (s->>'net_receipts')::numeric<>50 then
    raise exception 'R5_B_FAILED_REFUND_CHANGED_NET_%',s->>'net_receipts';
  end if;
  if (p->>'active_refund_reservation_total')::numeric<>0 then
    raise exception 'R5_B_FAILED_REFUND_STILL_RESERVED_%',p->>'active_refund_reservation_total';
  end if;
  if (p->>'refundable_remaining_amount')::numeric<>50 then
    raise exception 'R5_B_FAILED_REFUND_DID_NOT_RELEASE_BALANCE_%',p->>'refundable_remaining_amount';
  end if;
end $$;

-- ============================================================
-- CASE C: Transfer preserves canonical refund origin.
-- The derived invoice payment must not become a second refund origin.
-- ============================================================

insert into public.service_requests(
  customer_name,phone,service_type,problem_description,city,address,
  customer_email,payment_choice_timing
) values (
  'QA R5 Transfer','0500000003','QA','QA','Makkah','QA',
  'qa-r5-transfer@example.com','prepay'
);

select set_config(
  'qa.r5.req_transfer',
  (
    select id::text from public.service_requests
    where customer_name='QA R5 Transfer'
    order by created_at desc limit 1
  ),
  true
);

insert into public.service_request_items(
  service_request_id,catalog_service_id,service_name,quantity,
  net_unit_price,tax_rate,gross_unit_price,item_source
) values (
  current_setting('qa.r5.req_transfer')::uuid,
  '2b4925a8-35ed-4378-99a2-f4a5045ed36a'::uuid,
  'QA R5 Transfer Service',1,50,0,50,'customer_request'
);

select set_config(
  'qa.r5.pay_transfer',
  public.finance_record_service_request_payment(
    current_setting('qa.r5.req_transfer')::uuid,
    50,'advance','cash','QA R5 transfer original payment'
  )::text,
  true
);

update public.service_requests
set workflow_stage='completed'
where id=current_setting('qa.r5.req_transfer')::uuid;

select set_config(
  'qa.r5.invoice_transfer',
  public.finance_create_invoice(
    current_setting('qa.r5.req_transfer')::uuid,
    'QA R5 final invoice',
    50
  )::text,
  true
);

select public.finance_update_invoice_draft(
  current_setting('qa.r5.invoice_transfer')::uuid,
  'QA R5 final work',
  '[{"description":"QA R5 final work","quantity":1,"unit_price":50,"warranty_days":0}]'::jsonb
);

select public.finance_set_invoice_status(
  current_setting('qa.r5.invoice_transfer')::uuid,
  'issued'
);

select set_config(
  'qa.r5.alias_transfer',
  (
    select transferred_invoice_payment_id::text
    from public.service_request_payments
    where id=current_setting('qa.r5.pay_transfer')::uuid
  ),
  true
);

do $$
declare a jsonb; p jsonb; s jsonb;
begin
  a:=public.finance_get_refund_availability(current_setting('qa.r5.req_transfer')::uuid);
  s:=private.payment_financial_state(current_setting('qa.r5.req_transfer')::uuid);

  if jsonb_array_length(a->'payments')<>1 then
    raise exception 'R5_C_CANONICAL_PAYMENT_COUNT_EXPECTED_1_GOT_%',jsonb_array_length(a->'payments');
  end if;

  p:=a->'payments'->0;

  if p->>'origin_type'<>'service_request_payment' then
    raise exception 'R5_C_ORIGIN_TYPE_EXPECTED_REQUEST_PAYMENT_GOT_%',p->>'origin_type';
  end if;

  if (p->>'origin_id')::uuid<>current_setting('qa.r5.pay_transfer')::uuid then
    raise exception 'R5_C_CANONICAL_ORIGIN_ID_CHANGED';
  end if;

  if (p->>'transferred_invoice_payment_id')::uuid<>current_setting('qa.r5.alias_transfer')::uuid then
    raise exception 'R5_C_TRANSFER_ALIAS_NOT_REPORTED';
  end if;

  if (s->>'gross_receipts')::numeric<>50 then
    raise exception 'R5_C_TRANSFER_DOUBLE_COUNTED_GROSS_%',s->>'gross_receipts';
  end if;
end $$;

-- Derived invoice alias must be rejected as refund origin.
do $$
declare blocked boolean:=false;
begin
  begin
    perform public.finance_request_refund(
      current_setting('qa.r5.req_transfer')::uuid,
      null,
      current_setting('qa.r5.alias_transfer')::uuid,
      10,
      'QA alias refund',
      'phase8-r5-alias-refund',
      ''
    );
  exception when others then
    if sqlerrm='refund_requires_canonical_request_payment' then
      blocked:=true;
    else
      raise;
    end if;
  end;

  if not blocked then
    raise exception 'R5_C_DERIVED_ALIAS_REFUND_NOT_BLOCKED';
  end if;
end $$;

-- Original request payment remains the valid canonical origin after transfer.
select set_config(
  'qa.r5.ref_transfer',
  public.finance_request_refund(
    current_setting('qa.r5.req_transfer')::uuid,
    current_setting('qa.r5.pay_transfer')::uuid,
    null,
    10,
    'QA canonical transferred refund',
    'phase8-r5-canonical-transfer-refund',
    ''
  )::text,
  true
);

do $$
declare r public.payment_refunds%rowtype;
begin
  select * into r
  from public.payment_refunds
  where id=current_setting('qa.r5.ref_transfer')::uuid;

  if r.origin_service_request_payment_id<>current_setting('qa.r5.pay_transfer')::uuid then
    raise exception 'R5_C_CANONICAL_REFUND_ORIGIN_CHANGED';
  end if;

  if r.origin_invoice_payment_id is not null then
    raise exception 'R5_C_CANONICAL_REFUND_STORED_DERIVED_ALIAS';
  end if;
end $$;

-- ============================================================
-- Final result summary before rollback.
-- ============================================================

select jsonb_build_object(
  'excess_case',
    jsonb_build_object(
      'original_payment',50,
      'successful_refund',20,
      'net_receipts',
        private.payment_financial_state(
          current_setting('qa.r5.req_excess')::uuid
        )->'net_receipts',
      'excess_refund_liability',
        private.payment_financial_state(
          current_setting('qa.r5.req_excess')::uuid
        )->'excess_refund_liability'
    ),
  'failed_case',
    jsonb_build_object(
      'refund_status',
        (select status from public.payment_refunds
         where id=current_setting('qa.r5.ref_failed')::uuid),
      'net_receipts',
        private.payment_financial_state(
          current_setting('qa.r5.req_failed')::uuid
        )->'net_receipts'
    ),
  'transfer_case',
    jsonb_build_object(
      'canonical_origin',
        current_setting('qa.r5.pay_transfer'),
      'derived_invoice_alias',
        current_setting('qa.r5.alias_transfer'),
      'canonical_payment_count',
        jsonb_array_length(
          public.finance_get_refund_availability(
            current_setting('qa.r5.req_transfer')::uuid
          )->'payments'
        ),
      'gross_receipts',
        private.payment_financial_state(
          current_setting('qa.r5.req_transfer')::uuid
        )->'gross_receipts'
    )
) as phase8_r5_result;

rollback;
