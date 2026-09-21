-- Batch 4: an actionable contact inbox and item-level warranty coverage.
create or replace function public.admin_update_contact_message_status(
  target_message_id uuid,
  new_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then
    raise exception 'insufficient_privilege';
  end if;
  if new_status not in ('new','read','resolved') then raise exception 'invalid_contact_status'; end if;
  update public.contact_messages
  set status = new_status,
      resolved_at = case when new_status = 'resolved' then coalesce(resolved_at,now()) else null end
  where id = target_message_id;
  if not found then raise exception 'contact_message_not_found'; end if;
end;
$$;
revoke all on function public.admin_update_contact_message_status(uuid,text) from public,anon;
grant execute on function public.admin_update_contact_message_status(uuid,text) to authenticated;

alter table public.invoice_line_items
  add column if not exists warranty_days integer not null default 0,
  add column if not exists warranty_terms text not null default '';
alter table public.invoice_line_items
  drop constraint if exists invoice_line_items_warranty_days_check;
alter table public.invoice_line_items
  add constraint invoice_line_items_warranty_days_check check (warranty_days between 0 and 3650);

create policy "customers read issued invoice lines"
on public.invoice_line_items for select to authenticated
using (exists(
  select 1 from public.invoices invoice
  where invoice.id = invoice_id
    and invoice.status = 'issued'
    and invoice.customer_id = (select auth.uid())
));

alter table public.warranty_claims
  add column if not exists invoice_id uuid references public.invoices(id) on delete restrict,
  add column if not exists invoice_line_item_id uuid references public.invoice_line_items(id) on delete restrict;
create index if not exists warranty_claims_invoice_line_idx
  on public.warranty_claims(invoice_line_item_id,created_at desc);
create unique index if not exists warranty_claims_one_open_per_line_idx
  on public.warranty_claims(customer_id,invoice_line_item_id)
  where invoice_line_item_id is not null and status in ('new','under_review','approved');

create or replace function public.customer_get_active_warranty_items()
returns table(
  service_request_id uuid,
  line_id uuid,
  description text,
  expires_at timestamptz,
  terms text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select invoice.service_request_id, line.id, line.description,
    invoice.issued_at + make_interval(days => line.warranty_days), line.warranty_terms
  from public.invoice_line_items line
  join public.invoices invoice on invoice.id = line.invoice_id
  where invoice.customer_id = auth.uid()
    and invoice.status = 'issued'
    and invoice.issued_at is not null
    and line.warranty_days > 0
    and now() <= invoice.issued_at + make_interval(days => line.warranty_days)
  order by invoice.issued_at desc, line.sort_order;
$$;
revoke all on function public.customer_get_active_warranty_items() from public,anon;
grant execute on function public.customer_get_active_warranty_items() to authenticated;

create or replace function public.submit_warranty_claim(
  target_service_request_id uuid,
  target_invoice_line_item_id uuid,
  claim_description text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claim_id uuid;
  eligible_invoice_id uuid;
begin
  if nullif(trim(claim_description),'') is null or char_length(trim(claim_description)) > 4000 then
    raise exception 'warranty_description_required';
  end if;

  select invoice.id into eligible_invoice_id
  from public.invoice_line_items line
  join public.invoices invoice on invoice.id = line.invoice_id
  where line.id = target_invoice_line_item_id
    and invoice.service_request_id = target_service_request_id
    and invoice.customer_id = auth.uid()
    and invoice.status = 'issued'
    and invoice.issued_at is not null
    and line.warranty_days > 0
    and now() <= invoice.issued_at + make_interval(days => line.warranty_days);
  if eligible_invoice_id is null then raise exception 'warranty_request_not_eligible'; end if;

  insert into public.warranty_claims(
    service_request_id,customer_id,invoice_id,invoice_line_item_id,description
  ) values (
    target_service_request_id,auth.uid(),eligible_invoice_id,target_invoice_line_item_id,trim(claim_description)
  ) returning id into claim_id;
  return claim_id;
exception when unique_violation then
  raise exception 'warranty_claim_already_open';
end;
$$;
revoke all on function public.submit_warranty_claim(uuid,uuid,text) from public,anon;
grant execute on function public.submit_warranty_claim(uuid,uuid,text) to authenticated;

create or replace function public.admin_update_warranty_claim(
  target_claim_id uuid,
  new_status text,
  new_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then
    raise exception 'insufficient_privilege';
  end if;
  if new_status not in ('new','under_review','approved','rejected','resolved') then
    raise exception 'invalid_warranty_status';
  end if;
  update public.warranty_claims
  set status = new_status,
      admin_notes = nullif(trim(coalesce(new_admin_notes,'')),''),
      updated_at = now()
  where id = target_claim_id;
  if not found then raise exception 'warranty_claim_not_found'; end if;
end;
$$;
revoke all on function public.admin_update_warranty_claim(uuid,text,text) from public,anon;
grant execute on function public.admin_update_warranty_claim(uuid,text,text) to authenticated;

create or replace function public.finance_update_invoice_draft(
  p_invoice_id uuid,
  p_work_summary text,
  p_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  bill public.invoices%rowtype;
  subtotal_value numeric(12,2);
  item jsonb;
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
       or coalesce((item->>'unit_price')::numeric,-1) < 0
       or coalesce((item->>'warranty_days')::integer,0) not between 0 and 3650
       or char_length(coalesce(item->>'warranty_terms','')) > 1000 then raise exception 'invalid_invoice_line'; end if;
  end loop;
  delete from public.invoice_line_items where invoice_id=p_invoice_id;
  insert into public.invoice_line_items(invoice_id,description,quantity,unit_price,warranty_days,warranty_terms,sort_order)
  select p_invoice_id, trim(value->>'description'), (value->>'quantity')::numeric,
    (value->>'unit_price')::numeric, coalesce((value->>'warranty_days')::integer,0),
    trim(coalesce(value->>'warranty_terms','')), ordinality-1
  from jsonb_array_elements(p_lines) with ordinality;
  select round(coalesce(sum(quantity*unit_price),0),2) into subtotal_value from public.invoice_line_items where invoice_id=p_invoice_id;
  update public.invoices set work_summary=trim(p_work_summary),description=trim(p_work_summary),subtotal=subtotal_value,
    tax_rate=0,tax_amount=0,total=subtotal_value,updated_at=now() where id=p_invoice_id;
end;
$$;
revoke all on function public.finance_update_invoice_draft(uuid,text,jsonb) from public,anon;
grant execute on function public.finance_update_invoice_draft(uuid,text,jsonb) to authenticated;
