-- Batch 3: admin-managed service catalogue and transparent price guidance.
create table public.service_catalog_items (
  id uuid primary key default gen_random_uuid(),
  service_key text not null unique,
  name text not null,
  description text not null default '',
  price_from numeric(12,2),
  pricing_mode text not null default 'inspection' check (pricing_mode in ('fixed','from','inspection')),
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index service_catalog_items_visible_order_idx on public.service_catalog_items(is_visible,sort_order);
alter table public.service_catalog_items enable row level security;
grant select on public.service_catalog_items to anon,authenticated;
grant insert,update,delete on public.service_catalog_items to authenticated;
create policy "public reads visible catalog items" on public.service_catalog_items for select to anon,authenticated using (is_visible or public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));
create policy "admins manage catalog items" on public.service_catalog_items for all to authenticated using (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[])) with check (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));
insert into public.service_catalog_items(service_key,name,description,pricing_mode,sort_order) values
 ('ac','التكييف','تنظيف وصيانة وتشخيص أعطال أجهزة التكييف.','inspection',0),
 ('plumbing','السباكة','معالجة التسريبات والأعطال والتمديدات الصحية.','inspection',1),
 ('electrical','الكهرباء','فحص الأعطال والتركيبات والتجهيزات الكهربائية.','inspection',2),
 ('carpentry','النجارة','إصلاح وتركيب الأبواب والأثاث والأعمال الخشبية.','inspection',3)
on conflict (service_key) do nothing;

-- Batch 4: contact messages are stored safely for administration; delivery email is configured later.
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text, email text, subject text, message text not null,
  status text not null default 'new' check(status in ('new','read','resolved')),
  created_at timestamptz not null default now(), resolved_at timestamptz
);
alter table public.contact_messages enable row level security;
grant select,update on public.contact_messages to authenticated;
create policy "admins manage contact messages" on public.contact_messages for all to authenticated using (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[])) with check (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));
create or replace function public.submit_contact_message(sender_name text,sender_phone text default null,sender_email text default null,message_subject text default null,message_body text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare message_id uuid;
begin
  if nullif(trim(sender_name),'') is null or nullif(trim(message_body),'') is null then raise exception 'contact_message_required'; end if;
  insert into public.contact_messages(name,phone,email,subject,message) values (trim(sender_name),nullif(trim(sender_phone),''),nullif(trim(sender_email),''),nullif(trim(message_subject),''),trim(message_body)) returning id into message_id;
  return message_id;
end; $$;
revoke all on function public.submit_contact_message(text,text,text,text,text) from public;
grant execute on function public.submit_contact_message(text,text,text,text,text) to anon,authenticated;

create table public.warranty_claims (
  id uuid primary key default gen_random_uuid(), service_request_id uuid not null references public.service_requests(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete restrict, description text not null,
  status text not null default 'new' check(status in ('new','under_review','approved','rejected','resolved')),
  admin_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index warranty_claims_request_idx on public.warranty_claims(service_request_id,created_at desc);
alter table public.warranty_claims enable row level security;
grant select,update on public.warranty_claims to authenticated;
create policy "customers read own warranty claims" on public.warranty_claims for select to authenticated using (customer_id=(select auth.uid()) or public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));
create policy "admins update warranty claims" on public.warranty_claims for update to authenticated using (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[])) with check (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));
create or replace function public.submit_warranty_claim(target_service_request_id uuid,claim_description text)
returns uuid language plpgsql security definer set search_path = public as $$
declare claim_id uuid;
begin
  if nullif(trim(claim_description),'') is null then raise exception 'warranty_description_required'; end if;
  if not exists(select 1 from public.service_requests where id=target_service_request_id and customer_id=auth.uid() and workflow_stage='completed') then raise exception 'warranty_request_not_eligible'; end if;
  insert into public.warranty_claims(service_request_id,customer_id,description) values(target_service_request_id,auth.uid(),trim(claim_description)) returning id into claim_id;
  return claim_id;
end; $$;
revoke all on function public.submit_warranty_claim(uuid,text) from public,anon;
grant execute on function public.submit_warranty_claim(uuid,text) to authenticated;
