-- Phase 9 P9.4 security / tax / privilege regression
-- Payment Test only. Self-contained and ends with ROLLBACK.

begin;

do $$
begin
  if has_function_privilege('anon','public.finance_get_canonical_report(date,date)','EXECUTE') then
    raise exception 'P94_ANON_CAN_EXECUTE_FINANCE_REPORT';
  end if;
  if not has_function_privilege('authenticated','public.finance_get_canonical_report(date,date)','EXECUTE') then
    raise exception 'P94_AUTH_FINANCE_REPORT_MISSING';
  end if;
  if has_function_privilege('service_role','public.finance_get_canonical_report(date,date)','EXECUTE') then
    raise exception 'P94_SERVICE_ROLE_CAN_EXECUTE_FINANCE_REPORT';
  end if;

  if has_function_privilege('anon','public.technician_record_collection(uuid,text,numeric,text,text,timestamptz)','EXECUTE') then
    raise exception 'P94_ANON_CAN_EXECUTE_TECH_COLLECTION';
  end if;
  if not has_function_privilege('authenticated','public.technician_record_collection(uuid,text,numeric,text,text,timestamptz)','EXECUTE') then
    raise exception 'P94_AUTH_TECH_COLLECTION_MISSING';
  end if;
  if has_function_privilege('service_role','public.technician_record_collection(uuid,text,numeric,text,text,timestamptz)','EXECUTE') then
    raise exception 'P94_SERVICE_ROLE_CAN_EXECUTE_TECH_COLLECTION';
  end if;

  if has_function_privilege('anon','public.gateway_get_runtime_config()','EXECUTE')
     or has_function_privilege('authenticated','public.gateway_get_runtime_config()','EXECUTE')
     or not has_function_privilege('service_role','public.gateway_get_runtime_config()','EXECUTE') then
    raise exception 'P94_GATEWAY_RUNTIME_ACL_FAILED';
  end if;

  if has_function_privilege('anon','public.gateway_start_refund(uuid,text)','EXECUTE')
     or has_function_privilege('authenticated','public.gateway_start_refund(uuid,text)','EXECUTE')
     or not has_function_privilege('service_role','public.gateway_start_refund(uuid,text)','EXECUTE') then
    raise exception 'P94_GATEWAY_REFUND_ACL_FAILED';
  end if;

  if has_table_privilege('anon','public.payment_attempts','SELECT')
     or has_table_privilege('authenticated','public.payment_attempts','INSERT')
     or has_table_privilege('authenticated','public.payment_attempts','UPDATE')
     or has_table_privilege('authenticated','public.payment_attempts','DELETE') then
    raise exception 'P94_PAYMENT_ATTEMPT_DIRECT_ACCESS_FAILED';
  end if;

  if has_table_privilege('anon','public.payment_refunds','SELECT')
     or has_table_privilege('authenticated','public.payment_refunds','INSERT')
     or has_table_privilege('authenticated','public.payment_refunds','UPDATE')
     or has_table_privilege('authenticated','public.payment_refunds','DELETE') then
    raise exception 'P94_REFUND_DIRECT_ACCESS_FAILED';
  end if;

  if has_table_privilege('anon','public.technician_collections','SELECT')
     or has_table_privilege('authenticated','public.technician_collections','INSERT')
     or has_table_privilege('authenticated','public.technician_collections','UPDATE')
     or has_table_privilege('authenticated','public.technician_collections','DELETE') then
    raise exception 'P94_COLLECTION_DIRECT_ACCESS_FAILED';
  end if;
end $$;

select set_config('request.jwt.claim.sub','bc3e11cc-1a2f-4fc8-a22d-28e04cacc506',true);

do $$
begin
  begin
    perform public.finance_get_canonical_report(null,null);
    raise exception 'P94_TECH_CAN_CALL_FINANCE_REPORT';
  exception when insufficient_privilege then
    null;
  end;
end $$;

select set_config('request.jwt.claim.sub','37d28ad8-e850-4861-8dd5-95deba60d5fd',true);

do $$
begin
  begin
    perform public.technician_record_collection(
      gen_random_uuid(),'cash',1,'qa-p94-admin-role','QA role check',now()
    );
    raise exception 'P94_FINANCE_ADMIN_CAN_CALL_TECH_COLLECTION';
  exception when insufficient_privilege then
    null;
  end;
end $$;

insert into public.business_finance_settings(
  id,legal_name,address,contact_email,tax_number,vat_registered,tax_rate,currency,
  payment_domain_enabled,gateway_enabled
) values (
  true,'QA P9.4 VAT','QA','qa-p94@example.com','310000000000003',true,15,'SAR',false,false
);

insert into public.service_requests(
  customer_name,phone,service_type,problem_description,city,address,customer_email,workflow_stage
) values (
  'QA P9.4 VAT','0500000094','QA','QA','Makkah','QA','qa-p94-customer@example.com','completed'
);

select set_config(
  'qa.p94.req',
  (select id::text from public.service_requests where customer_name='QA P9.4 VAT' order by created_at desc limit 1),
  true
);

select set_config(
  'qa.p94.inv',
  public.finance_create_invoice(
    current_setting('qa.p94.req')::uuid,'QA P9.4 VAT invoice',100
  )::text,
  true
);

insert into public.invoice_line_items(
  invoice_id,description,quantity,unit_price,sort_order,warranty_days,warranty_terms
) values (
  current_setting('qa.p94.inv')::uuid,'QA VAT line',1,100,0,1,'QA'
);

do $$
begin
  begin
    perform public.finance_set_invoice_status(current_setting('qa.p94.inv')::uuid,'issued');
    raise exception 'P94_VAT_FAIL_CLOSED_FAILED';
  exception when raise_exception then
    if sqlerrm<>'tax_invoicing_integration_required' then raise; end if;
  end;

  if (select status from public.invoices where id=current_setting('qa.p94.inv')::uuid)<>'draft' then
    raise exception 'P94_VAT_INVOICE_LEFT_DRAFT';
  end if;

  if (select tax_amount from public.invoices where id=current_setting('qa.p94.inv')::uuid)<>15 then
    raise exception 'P94_TAX_AMOUNT_EXPECTED_15';
  end if;

  if (select total from public.invoices where id=current_setting('qa.p94.inv')::uuid)<>115 then
    raise exception 'P94_TOTAL_EXPECTED_115';
  end if;
end $$;

select jsonb_build_object(
  'acl_matrix','pass',
  'direct_table_mutation','blocked',
  'cross_role_runtime','blocked',
  'vat_issue_guard','tax_invoicing_integration_required',
  'vat_invoice_status',(select status from public.invoices where id=current_setting('qa.p94.inv')::uuid),
  'vat_tax_amount',(select tax_amount from public.invoices where id=current_setting('qa.p94.inv')::uuid),
  'vat_total',(select total from public.invoices where id=current_setting('qa.p94.inv')::uuid)
) as phase9_p94_result;

rollback;
