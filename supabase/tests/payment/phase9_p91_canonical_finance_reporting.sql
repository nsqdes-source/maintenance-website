-- Phase 9 P9.1 canonical finance reporting regression
-- Payment Test only. Self-contained and ends with ROLLBACK.

begin;

insert into public.business_finance_settings(
  id,legal_name,address,contact_email,tax_number,vat_registered,tax_rate,currency,
  payment_domain_enabled,gateway_enabled
) values (
  true,'QA P9.1','QA','qa@example.com','',false,0,'SAR',false,false
);

set local "request.jwt.claim.sub"='37d28ad8-e850-4861-8dd5-95deba60d5fd';

insert into public.service_requests(
  customer_name,phone,service_type,problem_description,city,address,
  customer_email,payment_choice_timing
) values (
  'QA P9.1','0500000091','QA','QA','Makkah','QA',
  'qa-p91@example.com','prepay'
);

select set_config(
  'qa.p91.req',
  (select id::text from public.service_requests where customer_name='QA P9.1' order by created_at desc limit 1),
  true
);

insert into public.service_request_items(
  service_request_id,catalog_service_id,service_name,quantity,
  net_unit_price,tax_rate,gross_unit_price,item_source
) values (
  current_setting('qa.p91.req')::uuid,
  '2b4925a8-35ed-4378-99a2-f4a5045ed36a'::uuid,
  'QA P9.1 Service',1,50,0,50,'customer_request'
);

select set_config(
  'qa.p91.pay',
  public.finance_record_service_request_payment(
    current_setting('qa.p91.req')::uuid,50,'advance','cash','QA P9.1 payment'
  )::text,
  true
);

update public.service_requests
set workflow_stage='completed'
where id=current_setting('qa.p91.req')::uuid;

select set_config(
  'qa.p91.invoice',
  public.finance_create_invoice(
    current_setting('qa.p91.req')::uuid,'QA P9.1 invoice',50
  )::text,
  true
);

select public.finance_update_invoice_draft(
  current_setting('qa.p91.invoice')::uuid,
  'QA P9.1 work',
  '[{"description":"QA P9.1 work","quantity":1,"unit_price":50,"warranty_days":1,"warranty_terms":"QA"}]'::jsonb
);

select public.finance_set_invoice_status(current_setting('qa.p91.invoice')::uuid,'issued');

select set_config(
  'qa.p91.ref',
  public.finance_request_refund(
    current_setting('qa.p91.req')::uuid,
    current_setting('qa.p91.pay')::uuid,
    null,20,'QA P9.1 refund','qa-p91-ref',''
  )::text,
  true
);

select public.finance_decide_refund(current_setting('qa.p91.ref')::uuid,'approved');
select private.payment_transition_refund(current_setting('qa.p91.ref')::uuid,'pending',null,null);
select private.payment_transition_refund(current_setting('qa.p91.ref')::uuid,'succeeded',null,null);

insert into public.finance_expenses(
  category,description,amount,expense_date,payment_method,vendor_name,reference,notes,created_by
) values (
  'operations','QA P9.1 expense',5,current_date,'cash','QA','','',
  '37d28ad8-e850-4861-8dd5-95deba60d5fd'::uuid
);

do $$
declare r jsonb;
begin
  r:=public.finance_get_canonical_report(current_date,current_date);

  if r->>'currency'<>'SAR' then raise exception 'P91_CURRENCY_FAILED'; end if;
  if (r->'period'->>'gross_receipts')::numeric<>50 then raise exception 'P91_PERIOD_GROSS_FAILED'; end if;
  if (r->'period'->>'succeeded_refunds')::numeric<>20 then raise exception 'P91_PERIOD_REFUNDS_FAILED'; end if;
  if (r->'period'->>'net_receipts')::numeric<>30 then raise exception 'P91_PERIOD_NET_FAILED'; end if;
  if (r->'period'->>'expenses')::numeric<>5 then raise exception 'P91_PERIOD_EXPENSES_FAILED'; end if;
  if (r->'period'->>'net_cash_flow')::numeric<>25 then raise exception 'P91_PERIOD_CASHFLOW_FAILED'; end if;
  if (r->'period'->>'issued_invoice_total')::numeric<>50 then raise exception 'P91_PERIOD_INVOICE_TOTAL_FAILED'; end if;
  if (r->'period'->>'issued_invoice_count')::bigint<>1 then raise exception 'P91_PERIOD_INVOICE_COUNT_FAILED'; end if;
  if (r->'current_position'->>'gross_receipts')::numeric<>50 then raise exception 'P91_DOUBLE_COUNT_FAILED'; end if;
  if (r->'current_position'->>'net_receipts')::numeric<>30 then raise exception 'P91_CURRENT_NET_FAILED'; end if;
  if (r->'current_position'->>'contractual_outstanding')::numeric<>20 then raise exception 'P91_OUTSTANDING_FAILED'; end if;
  if (r->'current_position'->>'excess_refund_liability')::numeric<>0 then raise exception 'P91_EXCESS_FAILED'; end if;
end $$;

select public.finance_get_canonical_report(current_date,current_date) as phase9_p91_result;

rollback;
