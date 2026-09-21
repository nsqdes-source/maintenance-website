-- Batch 3: preserve structured quote lines and carry the approved quote into
-- the invoice draft created when the request is completed.
alter table public.service_request_quotes
  add column if not exists line_items jsonb not null default '[]'::jsonb;

alter table public.service_request_quotes
  drop constraint if exists service_request_quotes_line_items_array;
alter table public.service_request_quotes
  add constraint service_request_quotes_line_items_array
  check (jsonb_typeof(line_items) = 'array');

create or replace function public.admin_submit_service_request_quote(
  target_service_request_id uuid,
  quote_description text,
  quote_line_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stage text;
  quote_id uuid;
  item jsonb;
  parts_total numeric(12,2) := 0;
  labor_total numeric(12,2) := 0;
  parts_summary text;
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then
    raise exception 'insufficient_privilege';
  end if;
  if nullif(trim(quote_description),'') is null
     or jsonb_typeof(quote_line_items) <> 'array'
     or jsonb_array_length(quote_line_items) = 0
     or jsonb_array_length(quote_line_items) > 100 then
    raise exception 'invalid_quote';
  end if;

  for item in select value from jsonb_array_elements(quote_line_items) loop
    if coalesce(item->>'item_type','') not in ('part','labor','other')
       or char_length(trim(coalesce(item->>'description',''))) not between 1 and 300
       or coalesce((item->>'quantity')::numeric,0) <= 0
       or coalesce((item->>'quantity')::numeric,0) > 100000
       or coalesce((item->>'unit_price')::numeric,-1) < 0 then
      raise exception 'invalid_quote_line';
    end if;
  end loop;

  select workflow_stage into stage
  from public.service_requests
  where id = target_service_request_id
  for update;
  if stage <> 'awaiting_admin_quote' then raise exception 'invalid_workflow_transition'; end if;

  select
    coalesce(sum(((value->>'quantity')::numeric) * ((value->>'unit_price')::numeric))
      filter (where value->>'item_type' in ('part','other')),0),
    coalesce(sum(((value->>'quantity')::numeric) * ((value->>'unit_price')::numeric))
      filter (where value->>'item_type' = 'labor'),0),
    string_agg(
      case when value->>'item_type' in ('part','other')
        then trim(value->>'description') || ' × ' || (value->>'quantity')
      end,
      '، '
    ) filter (where value->>'item_type' in ('part','other'))
  into parts_total, labor_total, parts_summary
  from jsonb_array_elements(quote_line_items);

  insert into public.service_request_quotes(
    service_request_id, description, parts_description, parts_cost,
    labor_cost, line_items, created_by
  ) values (
    target_service_request_id, trim(quote_description), parts_summary,
    round(parts_total,2), round(labor_total,2), quote_line_items, auth.uid()
  ) returning id into quote_id;

  update public.service_requests
  set workflow_stage = 'awaiting_customer_approval', workflow_updated_at = now()
  where id = target_service_request_id;
  return quote_id;
end;
$$;
revoke all on function public.admin_submit_service_request_quote(uuid,text,jsonb) from public,anon;
grant execute on function public.admin_submit_service_request_quote(uuid,text,jsonb) to authenticated;

create or replace function private.finance_seed_invoice_from_approved_quote(
  p_invoice_id uuid,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quote_record public.service_request_quotes%rowtype;
  subtotal_value numeric(12,2);
begin
  if exists(select 1 from public.invoice_line_items where invoice_id = p_invoice_id) then return; end if;

  select * into quote_record
  from public.service_request_quotes
  where service_request_id = p_request_id and status = 'approved'
  order by decided_at desc nulls last, created_at desc
  limit 1;
  if not found then return; end if;

  if jsonb_array_length(quote_record.line_items) > 0 then
    insert into public.invoice_line_items(invoice_id,description,quantity,unit_price,sort_order)
    select p_invoice_id, trim(value->>'description'),
      (value->>'quantity')::numeric, (value->>'unit_price')::numeric, ordinality-1
    from jsonb_array_elements(quote_record.line_items) with ordinality;
  else
    insert into public.invoice_line_items(invoice_id,description,quantity,unit_price,sort_order)
    select p_invoice_id, description, 1, amount, sort_order
    from (
      values
        (coalesce(nullif(quote_record.parts_description,''),'قطع وتعديلات'), quote_record.parts_cost, 0),
        ('أجرة العمل', quote_record.labor_cost, 1)
    ) as legacy_lines(description,amount,sort_order)
    where amount > 0;
  end if;

  if not exists(select 1 from public.invoice_line_items where invoice_id = p_invoice_id) then
    insert into public.invoice_line_items(invoice_id,description,quantity,unit_price,sort_order)
    values(p_invoice_id, quote_record.description, 1, 0, 0);
  end if;

  select round(coalesce(sum(quantity * unit_price),0),2)
  into subtotal_value
  from public.invoice_line_items
  where invoice_id = p_invoice_id;

  update public.invoices
  set work_summary = quote_record.description,
      description = quote_record.description,
      subtotal = subtotal_value,
      tax_rate = 0,
      tax_amount = 0,
      total = subtotal_value,
      updated_at = now()
  where id = p_invoice_id and status = 'draft';
end;
$$;
revoke all on function private.finance_seed_invoice_from_approved_quote(uuid,uuid) from public,anon,authenticated;

create or replace function public.finance_ensure_invoice_draft(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_record public.service_requests%rowtype;
  settings_record public.business_finance_settings%rowtype;
  result_id uuid;
  result_status text;
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then
    raise exception 'insufficient_privilege';
  end if;
  select * into request_record from public.service_requests where id=p_request_id for update;
  if not found or request_record.workflow_stage <> 'completed' then raise exception 'request_not_completed'; end if;

  select id,status into result_id,result_status
  from public.invoices
  where service_request_id=p_request_id and status in ('draft','issued')
  order by created_at desc limit 1;
  if result_id is not null then
    if result_status = 'draft' then
      perform private.finance_seed_invoice_from_approved_quote(result_id,p_request_id);
    end if;
    return result_id;
  end if;

  select * into settings_record from public.business_finance_settings where id=true;
  insert into public.invoices (
    service_request_id,customer_id,customer_name,customer_email,customer_phone,
    service_type,work_summary,business_name,business_address,business_email,
    business_tax_number,vat_registered,description,subtotal,tax_rate,tax_amount,total,created_by
  ) values (
    request_record.id,request_record.customer_id,request_record.customer_name,
    coalesce(request_record.customer_email,''),coalesce(request_record.phone,''),
    coalesce(request_record.service_type,''),coalesce(request_record.visit_notes,request_record.problem_description,''),
    settings_record.legal_name,settings_record.address,settings_record.contact_email,
    settings_record.tax_number,coalesce(settings_record.vat_registered,false),
    coalesce(nullif(trim(request_record.visit_notes),''),nullif(trim(request_record.problem_description),''),'خدمة صيانة'),
    0,0,0,0,auth.uid()
  ) returning id into result_id;

  perform private.finance_seed_invoice_from_approved_quote(result_id,p_request_id);
  return result_id;
end;
$$;
revoke all on function public.finance_ensure_invoice_draft(uuid) from public,anon;
grant execute on function public.finance_ensure_invoice_draft(uuid) to authenticated;
