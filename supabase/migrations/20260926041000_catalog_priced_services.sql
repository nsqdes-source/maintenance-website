-- Priced sub-services catalog.
-- Customer-facing prices are stored and displayed VAT-inclusive.

create table public.service_catalog_services (
  id uuid primary key default gen_random_uuid(),

  service_catalog_item_id uuid not null
    references public.service_catalog_items(id)
    on delete restrict,

  name text not null
    check (char_length(trim(name)) between 1 and 120),

  description text not null default '',

  -- Net price before VAT.
  net_price numeric(12,2) not null
    check (net_price >= 0),

  -- VAT snapshot used to calculate the customer-facing price.
  tax_rate numeric(5,2) not null default 0
    check (tax_rate between 0 and 100),

  -- Customer-facing price, always calculated VAT-inclusive.
  gross_price numeric(12,2)
    generated always as (
      round(net_price + (net_price * tax_rate / 100), 2)
    ) stored,

  is_visit_service boolean not null default false,
  is_active boolean not null default true,

  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_catalog_service_tax_rate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  finance_settings public.business_finance_settings%rowtype;
begin
  select *
  into finance_settings
  from public.business_finance_settings
  where id = true;

  new.tax_rate :=
    case
      when coalesce(finance_settings.vat_registered, false)
        then finance_settings.tax_rate
      else 0
    end;

  return new;
end;
$$;

create trigger service_catalog_services_tax_rate_trigger
before insert or update of net_price
on public.service_catalog_services
for each row
execute function public.set_catalog_service_tax_rate();

create unique index service_catalog_services_name_per_category_idx
  on public.service_catalog_services (
    service_catalog_item_id,
    lower(name)
  );

create index service_catalog_services_active_idx
  on public.service_catalog_services (
    service_catalog_item_id,
    is_active,
    sort_order
  );

alter table public.service_catalog_services
  enable row level security;

grant select on public.service_catalog_services
  to anon, authenticated;

grant insert, update, delete on public.service_catalog_services
  to authenticated;

create policy "public reads active catalog services"
  on public.service_catalog_services
  for select
  to anon, authenticated
  using (
    is_active
    or public.current_user_has_role(
      array[
        'maintenance_manager',
        'admin_manager',
        'super_admin'
      ]::public.app_role[]
    )
  );

create policy "admins manage catalog services"
  on public.service_catalog_services
  for all
  to authenticated
  using (
    public.current_user_has_role(
      array[
        'maintenance_manager',
        'admin_manager',
        'super_admin'
      ]::public.app_role[]
    )
  )
  with check (
    public.current_user_has_role(
      array[
        'maintenance_manager',
        'admin_manager',
        'super_admin'
      ]::public.app_role[]
    )
  );