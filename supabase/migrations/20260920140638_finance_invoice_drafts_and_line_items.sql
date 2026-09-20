-- Finance v2: automatic draft invoices, immutable issued snapshots, and reviewed line items.
alter table public.invoices
  add column if not exists customer_phone text not null default '',
  add column if not exists service_type text not null default '',
  add column if not exists work_summary text not null default '',
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 300),
  quantity numeric(10,2) not null default 1 check (quantity > 0 and quantity <= 100000),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);
create index if not exists invoice_line_items_invoice_idx on public.invoice_line_items(invoice_id,sort_order);
alter table public.invoice_line_items enable row level security;
grant select on public.invoice_line_items to authenticated;
create policy "finance managers read invoice lines" on public.invoice_line_items for select to authenticated
using (public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]));
create unique index if not exists invoices_one_active_per_request
on public.invoices(service_request_id) where status in ('draft','issued');

create or replace function public.finance_ensure_invoice_draft(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.service_requests%rowtype; s public.business_finance_settings%rowtype; result_id uuid;
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
  select * into r from public.service_requests where id=p_request_id for update;
  if not found or r.workflow_stage <> 'completed' then raise exception 'request_not_completed'; end if;
  select id into result_id from public.invoices where service_request_id=p_request_id and status in ('draft','issued') order by created_at desc limit 1;
  if result_id is not null then return result_id; end if;
  select * into s from public.business_finance_settings where id=true;
  insert into public.invoices (
    service_request_id,customer_id,customer_name,customer_email,customer_phone,service_type,work_summary,
    business_name,business_address,business_email,business_tax_number,vat_registered,
    description,subtotal,tax_rate,tax_amount,total,created_by
  ) values (
    r.id,r.customer_id,r.customer_name,coalesce(r.customer_email,''),coalesce(r.phone,''),coalesce(r.service_type,''),coalesce(r.visit_notes,r.problem_description,''),
    s.legal_name,s.address,s.contact_email,s.tax_number,coalesce(s.vat_registered,false),
    coalesce(nullif(trim(r.visit_notes),''),nullif(trim(r.problem_description),''),'خدمة صيانة'),0,0,0,0,auth.uid()
  ) returning id into result_id;
  return result_id;
end; $$;
revoke all on function public.finance_ensure_invoice_draft(uuid) from public,anon;
grant execute on function public.finance_ensure_invoice_draft(uuid) to authenticated;

create or replace function public.finance_update_invoice_draft(p_invoice_id uuid,p_work_summary text,p_lines jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare bill public.invoices%rowtype; subtotal_value numeric(12,2); item jsonb;
begin
  if not public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>100 then raise exception 'invoice_lines_required'; end if;
  select * into bill from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if bill.status <> 'draft' then raise exception 'invoice_not_draft'; end if;
  if char_length(trim(coalesce(p_work_summary,''))) < 3 or char_length(trim(p_work_summary)) > 4000 then raise exception 'invalid_work_summary'; end if;
  for item in select value from jsonb_array_elements(p_lines) loop
    if char_length(trim(coalesce(item->>'description',''))) < 1 or char_length(trim(item->>'description')) > 300
       or coalesce((item->>'quantity')::numeric,0) <= 0 or coalesce((item->>'quantity')::numeric,0) > 100000
       or coalesce((item->>'unit_price')::numeric,-1) < 0 then raise exception 'invalid_invoice_line'; end if;
  end loop;
  delete from public.invoice_line_items where invoice_id=p_invoice_id;
  insert into public.invoice_line_items(invoice_id,description,quantity,unit_price,sort_order)
  select p_invoice_id, trim(value->>'description'), (value->>'quantity')::numeric, (value->>'unit_price')::numeric, ordinality-1
  from jsonb_array_elements(p_lines) with ordinality;
  select round(coalesce(sum(quantity*unit_price),0),2) into subtotal_value from public.invoice_line_items where invoice_id=p_invoice_id;
  update public.invoices set work_summary=trim(p_work_summary),description=trim(p_work_summary),subtotal=subtotal_value,
    tax_rate=0,tax_amount=0,total=subtotal_value,updated_at=now() where id=p_invoice_id;
end; $$;
revoke all on function public.finance_update_invoice_draft(uuid,text,jsonb) from public,anon;
grant execute on function public.finance_update_invoice_draft(uuid,text,jsonb) to authenticated;

create or replace function public.finance_set_invoice_status(p_invoice_id uuid,p_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare bill public.invoices%rowtype;
begin
 if not public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 if p_status not in ('issued','void') then raise exception 'invalid_status'; end if;
 select * into bill from public.invoices where id=p_invoice_id for update;
 if not found then raise exception 'invoice_not_found'; end if;
 if p_status = 'issued' then
   if bill.vat_registered then raise exception 'tax_invoicing_integration_required'; end if;
   if bill.status <> 'draft' then raise exception 'invoice_not_draft'; end if;
   if not exists(select 1 from public.invoice_line_items where invoice_id=p_invoice_id) then raise exception 'invoice_lines_required'; end if;
   update public.invoices set status='issued',issued_at=now(),updated_at=now() where id=p_invoice_id;
 else
   if bill.status not in ('draft','issued') then raise exception 'invoice_not_active'; end if;
   if exists(select 1 from public.invoice_payments where invoice_id=p_invoice_id and voided_at is null) then raise exception 'invoice_has_payments'; end if;
   update public.invoices set status='void',issued_at=coalesce(issued_at,now()),paid_at=null,updated_at=now() where id=p_invoice_id;
 end if;
end; $$;
revoke all on function public.finance_set_invoice_status(uuid,text) from public,anon;
grant execute on function public.finance_set_invoice_status(uuid,text) to authenticated;

create or replace function public.admin_advance_service_request(target_service_request_id uuid,new_stage text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare current_stage text;
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
  select workflow_stage into current_stage from public.service_requests where id = target_service_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if not ((current_stage = 'technician_accepted' and new_stage = 'in_progress') or
    (current_stage = 'needs_followup' and new_stage = 'awaiting_admin_quote') or
    (current_stage = 'quote_approved' and new_stage = 'in_progress') or
    (current_stage = 'awaiting_completion_review' and new_stage = 'completed') or
    (current_stage in ('reschedule_requested','unable_to_complete') and new_stage = 'in_progress')) then raise exception 'invalid_workflow_transition'; end if;
  update public.service_requests set workflow_stage = new_stage, workflow_updated_at = now(),
    completion_reviewed_at = case when new_stage = 'completed' then now() else completion_reviewed_at end,
    completion_reviewed_by = case when new_stage = 'completed' then auth.uid() else completion_reviewed_by end
  where id = target_service_request_id;
  if new_stage = 'completed' then
    perform public.finance_ensure_invoice_draft(target_service_request_id);
  end if;
end; $$;
revoke all on function public.admin_advance_service_request(uuid,text) from public,anon;
grant execute on function public.admin_advance_service_request(uuid,text) to authenticated;
