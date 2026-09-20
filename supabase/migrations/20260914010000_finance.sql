-- Finance data is private to management. Invoice totals are immutable snapshots once issued.
create table public.business_finance_settings (
 id boolean primary key default true check (id),
 legal_name text not null default 'مؤسسة أمان للمقاولات',
 address text not null default '',
 contact_email text not null default '',
 tax_number text not null default '',
 vat_registered boolean,
 currency text not null default 'SAR' check (currency = 'SAR'),
 tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
 updated_at timestamptz not null default now()
);
insert into public.business_finance_settings(id) values(true);
alter table public.business_finance_settings enable row level security;
create policy finance_settings_managers on public.business_finance_settings for all to authenticated
 using (public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]))
 with check (public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]));
grant select, update on public.business_finance_settings to authenticated;

create table public.invoices (
 id uuid primary key default gen_random_uuid(),
 invoice_number bigint generated always as identity unique,
 service_request_id uuid not null references public.service_requests(id),
 customer_id uuid references public.profiles(id),
 customer_name text not null,
 customer_email text not null,
 business_name text not null,
 business_address text not null,
 business_email text not null,
 business_tax_number text not null,
 vat_registered boolean not null,
 description text not null,
 subtotal numeric(12,2) not null check (subtotal >= 0),
 tax_rate numeric(5,2) not null check (tax_rate between 0 and 100),
 tax_amount numeric(12,2) not null check (tax_amount >= 0),
 total numeric(12,2) not null check (total >= 0),
 currency text not null default 'SAR' check (currency = 'SAR'),
 status text not null default 'draft' check (status in ('draft','issued','void')),
 issued_at timestamptz,
 paid_at timestamptz,
 emailed_at timestamptz,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 check ((status = 'draft' and issued_at is null) or (status <> 'draft' and issued_at is not null))
);
create index invoices_request_idx on public.invoices(service_request_id,created_at desc);
create index invoices_status_idx on public.invoices(status,issued_at desc);
alter table public.invoices enable row level security;
create policy invoices_manager_read on public.invoices for select to authenticated
 using (public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]));
create policy invoices_customer_read on public.invoices for select to authenticated
 using (status = 'issued' and customer_id = (select auth.uid()));
grant select on public.invoices to authenticated;

create or replace function public.finance_save_settings(p_name text,p_address text,p_email text,p_tax_number text,p_tax_rate numeric,p_vat_registered boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 if nullif(trim(p_name),'') is null or p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 or p_vat_registered is null then raise exception 'invalid_finance_settings'; end if;
 if not p_vat_registered and p_tax_rate <> 0 then raise exception 'non_vat_tax_rate_must_be_zero'; end if;
 update public.business_finance_settings set legal_name=trim(p_name),address=trim(p_address),contact_email=trim(p_email),tax_number=trim(p_tax_number),tax_rate=p_tax_rate,vat_registered=p_vat_registered,updated_at=now() where id=true;
end $$;
revoke all on function public.finance_save_settings(text,text,text,text,numeric,boolean) from public,anon;
grant execute on function public.finance_save_settings(text,text,text,text,numeric,boolean) to authenticated;

create or replace function public.finance_create_invoice(p_request_id uuid,p_description text,p_subtotal numeric)
returns uuid language plpgsql security definer set search_path=public as $$
declare r public.service_requests%rowtype; s public.business_finance_settings%rowtype; new_id uuid; tax numeric(12,2);
begin
 if not public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 if nullif(trim(p_description),'') is null or p_subtotal is null or p_subtotal < 0 then raise exception 'invalid_invoice'; end if;
 select * into r from public.service_requests where id=p_request_id;
 if not found or r.workflow_stage <> 'completed' then raise exception 'request_not_completed'; end if;
 if nullif(trim(r.customer_email),'') is null then raise exception 'customer_email_required'; end if;
 select * into s from public.business_finance_settings where id=true;
 if s.vat_registered is null then raise exception 'vat_registration_status_required'; end if;
 if s.vat_registered and nullif(s.tax_number,'') is null then raise exception 'tax_number_required'; end if;
 tax := round(p_subtotal * s.tax_rate / 100,2);
 insert into public.invoices(service_request_id,customer_id,customer_name,customer_email,business_name,business_address,business_email,business_tax_number,vat_registered,description,subtotal,tax_rate,tax_amount,total,created_by)
 values(r.id,r.customer_id,r.customer_name,r.customer_email,s.legal_name,s.address,s.contact_email,s.tax_number,s.vat_registered,trim(p_description),p_subtotal,s.tax_rate,tax,p_subtotal+tax,auth.uid()) returning id into new_id;
 return new_id;
end $$;
revoke all on function public.finance_create_invoice(uuid,text,numeric) from public,anon;
grant execute on function public.finance_create_invoice(uuid,text,numeric) to authenticated;

create or replace function public.finance_set_invoice_status(p_invoice_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public as $$
declare bill public.invoices%rowtype;
begin
 if not public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 if p_status not in ('issued','void') then raise exception 'invalid_status'; end if;
 select * into bill from public.invoices where id=p_invoice_id for update;
 if not found then raise exception 'invoice_not_found'; end if;
 if p_status = 'issued' then
   if bill.vat_registered or exists(select 1 from public.business_finance_settings where id=true and vat_registered is distinct from false) then
     raise exception 'tax_invoicing_integration_required';
   end if;
   if bill.status <> 'draft' then raise exception 'invoice_not_draft'; end if;
   update public.invoices set status='issued',issued_at=now() where id=p_invoice_id;
 else
   if bill.status not in ('draft','issued') then raise exception 'invoice_not_active'; end if;
   if exists(select 1 from public.invoice_payments where invoice_id=p_invoice_id and voided_at is null) then
     raise exception 'invoice_has_payments';
   end if;
   update public.invoices set status='void',issued_at=coalesce(issued_at,now()),paid_at=null where id=p_invoice_id;
 end if;
end $$;
revoke all on function public.finance_set_invoice_status(uuid,text) from public,anon;
grant execute on function public.finance_set_invoice_status(uuid,text) to authenticated;

create or replace function public.finance_mark_invoice_emailed(p_invoice_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 update public.invoices set emailed_at=now() where id=p_invoice_id and status='issued';
 if not found then raise exception 'invoice_not_issued'; end if;
end $$;
revoke all on function public.finance_mark_invoice_emailed(uuid) from public,anon;
grant execute on function public.finance_mark_invoice_emailed(uuid) to authenticated;

-- Payment ledger: issued invoices are receivables; revenue is recorded only when collected.
create table public.invoice_payments (
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null references public.invoices(id),
 amount numeric(12,2) not null check(amount > 0),
 method text not null check(method in ('cash','bank_transfer','card','other')),
 note text not null default '',
 paid_at timestamptz not null default now(),
 recorded_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 voided_at timestamptz,
 voided_by uuid references public.profiles(id)
);
create index invoice_payments_invoice_idx on public.invoice_payments(invoice_id,paid_at desc);
alter table public.invoice_payments enable row level security;
create policy invoice_payments_managers on public.invoice_payments for select to authenticated
 using (public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]));
grant select on public.invoice_payments to authenticated;

create or replace function public.finance_record_payment(p_invoice_id uuid,p_amount numeric,p_method text,p_note text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare bill public.invoices%rowtype; received numeric(12,2); payment_id uuid;
begin
 if not public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 if p_amount is null or p_amount <= 0 or p_method not in ('cash','bank_transfer','card','other') then raise exception 'invalid_payment'; end if;
 select * into bill from public.invoices where id=p_invoice_id for update;
 if not found or bill.status <> 'issued' then raise exception 'invoice_not_issued'; end if;
 select coalesce(sum(amount),0) into received from public.invoice_payments where invoice_id=p_invoice_id and voided_at is null;
 if received+p_amount > bill.total then raise exception 'payment_exceeds_balance'; end if;
 insert into public.invoice_payments(invoice_id,amount,method,note,recorded_by) values(p_invoice_id,p_amount,p_method,left(trim(coalesce(p_note,'')),500),auth.uid()) returning id into payment_id;
 if received+p_amount = bill.total then update public.invoices set paid_at=now() where id=p_invoice_id; end if;
 return payment_id;
end $$;
revoke all on function public.finance_record_payment(uuid,numeric,text,text) from public,anon;
grant execute on function public.finance_record_payment(uuid,numeric,text,text) to authenticated;

create or replace function public.finance_void_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare bill_id uuid;
begin
 if not public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 select invoice_id into bill_id from public.invoice_payments where id=p_payment_id;
 if not found then raise exception 'payment_not_found'; end if;
 perform 1 from public.invoices where id=bill_id for update;
 update public.invoice_payments set voided_at=now(),voided_by=auth.uid() where id=p_payment_id and voided_at is null;
 if not found then raise exception 'payment_already_void'; end if;
 update public.invoices set paid_at=null where id=bill_id;
end $$;
revoke all on function public.finance_void_payment(uuid) from public,anon;
grant execute on function public.finance_void_payment(uuid) to authenticated;

create or replace function public.finance_get_summary()
returns table(issued_total numeric,collected_total numeric,outstanding_total numeric)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 return query select coalesce((select sum(i.total) from public.invoices i where i.status='issued'),0),
  coalesce((select sum(p.amount) from public.invoice_payments p join public.invoices i on i.id=p.invoice_id where i.status='issued' and p.voided_at is null),0),
  coalesce((select sum(i.total) from public.invoices i where i.status='issued'),0) -
  coalesce((select sum(p.amount) from public.invoice_payments p join public.invoices i on i.id=p.invoice_id where i.status='issued' and p.voided_at is null),0);
end $$;
revoke all on function public.finance_get_summary() from public,anon;
grant execute on function public.finance_get_summary() to authenticated;
