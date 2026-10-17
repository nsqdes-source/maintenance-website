-- Phase 8 R3 provider-neutral refund regression
-- Payment Test only. Must run in a controlled environment.
-- This script is self-contained and ends with ROLLBACK.

begin;

insert into public.business_finance_settings(
  id,legal_name,vat_registered,tax_rate,currency,
  payment_domain_enabled,gateway_enabled,gateway_provider,gateway_environment
) values (true,'QA Phase 8 R3',false,0,'SAR',true,true,'phase8-test-provider','test');

set local "request.jwt.claim.sub" = '37d28ad8-e850-4861-8dd5-95deba60d5fd';

insert into public.service_requests(
  customer_name,phone,service_type,problem_description,city,address,payment_choice_timing
) values (
  'QA Phase 8 R3','0500000000','QA','QA','Makkah','QA','prepay'
);

select set_config(
  'qa.r3_request',
  (
    select id::text
    from public.service_requests
    where customer_name='QA Phase 8 R3'
    order by created_at desc
    limit 1
  ),
  true
);

insert into public.service_request_items(
  service_request_id,catalog_service_id,service_name,quantity,
  net_unit_price,tax_rate,gross_unit_price,item_source
) values (
  current_setting('qa.r3_request')::uuid,
  '2b4925a8-35ed-4378-99a2-f4a5045ed36a'::uuid,
  'QA Phase 8 Service',
  1,50,0,50,'customer_request'
);

select set_config(
  'qa.r3_attempt',
  private.payment_create_authoritative_attempt(
    current_setting('qa.r3_request')::uuid,
    'phase8-test-provider',
    'test',
    'phase8-r3-attempt'
  )::text,
  true
);

select set_config(
  'qa.r3_event',
  private.payment_record_provider_event(
    'phase8-test-provider',
    'test',
    'phase8-r3-payment-success',
    'payment.succeeded',
    repeat('a',64),
    current_setting('qa.r3_attempt')::uuid,
    'phase8-r3-payment-txn',
    '{}'::jsonb
  )::text,
  true
);

select private.payment_apply_verified_provider_result(
  current_setting('qa.r3_event')::uuid,
  'succeeded',
  'phase8-r3-payment-txn',
  50,
  'SAR',
  null
);

select set_config(
  'qa.r3_origin',
  private.payment_post_verified_attempt(
    current_setting('qa.r3_attempt')::uuid,
    'phase8-r3-payment-post'
  )::text,
  true
);

select set_config(
  'qa.r3_refund_success',
  public.finance_request_refund(
    current_setting('qa.r3_request')::uuid,
    current_setting('qa.r3_origin')::uuid,
    null,
    20,
    'QA provider refund success',
    'phase8-r3-refund-success',
    ''
  )::text,
  true
);

select public.finance_decide_refund(
  current_setting('qa.r3_refund_success')::uuid,
  'approved'
);

set local role service_role;

select public.gateway_start_refund(
  current_setting('qa.r3_refund_success')::uuid,
  'phase8-r3-provider-refund-success'
);

select public.gateway_start_refund(
  current_setting('qa.r3_refund_success')::uuid,
  'phase8-r3-provider-refund-success'
);

do $$
declare
  blocked boolean:=false;
begin
  begin
    perform public.gateway_start_refund(
      current_setting('qa.r3_refund_success')::uuid,
      'phase8-r3-provider-refund-conflict'
    );
  exception when others then
    if sqlerrm='provider_refund_identity_conflict' then
      blocked:=true;
    else
      raise;
    end if;
  end;

  if not blocked then
    raise exception 'R3_PROVIDER_REFUND_ID_CONFLICT_NOT_BLOCKED';
  end if;
end $$;

select public.gateway_apply_verified_refund_result(
  current_setting('qa.r3_refund_success')::uuid,
  'phase8-r3-provider-refund-success',
  'succeeded',
  null
);

select public.gateway_apply_verified_refund_result(
  current_setting('qa.r3_refund_success')::uuid,
  'phase8-r3-provider-refund-success',
  'succeeded',
  null
);

reset role;

do $$
declare
  net_value numeric;
  status_value text;
begin
  select status
  into status_value
  from public.payment_refunds
  where id=current_setting('qa.r3_refund_success')::uuid;

  if status_value<>'succeeded' then
    raise exception 'R3_SUCCESS_STATUS_FAILED';
  end if;

  net_value:=(
    private.payment_financial_state(
      current_setting('qa.r3_request')::uuid
    )->>'net_receipts'
  )::numeric;

  if net_value<>30 then
    raise exception 'R3_NET_RECEIPTS_EXPECTED_30_GOT_%',net_value;
  end if;
end $$;

-- Failure branch on the same original payment, within remaining refundable balance.
select set_config(
  'qa.r3_refund_failed',
  public.finance_request_refund(
    current_setting('qa.r3_request')::uuid,
    current_setting('qa.r3_origin')::uuid,
    null,
    10,
    'QA provider refund failed',
    'phase8-r3-refund-failed',
    ''
  )::text,
  true
);

select public.finance_decide_refund(
  current_setting('qa.r3_refund_failed')::uuid,
  'approved'
);

set local role service_role;

select public.gateway_start_refund(
  current_setting('qa.r3_refund_failed')::uuid,
  'phase8-r3-provider-refund-failed'
);

select public.gateway_apply_verified_refund_result(
  current_setting('qa.r3_refund_failed')::uuid,
  'phase8-r3-provider-refund-failed',
  'failed',
  'qa_failure'
);

select public.gateway_apply_verified_refund_result(
  current_setting('qa.r3_refund_failed')::uuid,
  'phase8-r3-provider-refund-failed',
  'failed',
  'qa_failure'
);

reset role;

do $$
declare
  net_value numeric;
  status_value text;
begin
  select status
  into status_value
  from public.payment_refunds
  where id=current_setting('qa.r3_refund_failed')::uuid;

  if status_value<>'failed' then
    raise exception 'R3_FAILED_STATUS_FAILED';
  end if;

  net_value:=(
    private.payment_financial_state(
      current_setting('qa.r3_request')::uuid
    )->>'net_receipts'
  )::numeric;

  if net_value<>30 then
    raise exception 'R3_FAILED_REFUND_CHANGED_NET_%',net_value;
  end if;
end $$;

select jsonb_build_object(
  'success_refund_status',
    (select status from public.payment_refunds where id=current_setting('qa.r3_refund_success')::uuid),
  'failed_refund_status',
    (select status from public.payment_refunds where id=current_setting('qa.r3_refund_failed')::uuid),
  'original_payment',
    (select amount from public.service_request_payments where id=current_setting('qa.r3_origin')::uuid),
  'succeeded_refund',
    (select amount from public.payment_refunds where id=current_setting('qa.r3_refund_success')::uuid),
  'net_receipts',
    private.payment_financial_state(
      current_setting('qa.r3_request')::uuid
    )->'net_receipts'
) as phase8_r3_result;

rollback;
