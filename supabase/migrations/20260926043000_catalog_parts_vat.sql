-- Add VAT-aware customer-facing pricing to catalog parts
-- while preserving default_price for backwards compatibility.

alter table public.service_catalog_parts
  add column if not exists tax_rate numeric(5,2) not null default 0
    check (tax_rate between 0 and 100);

alter table public.service_catalog_parts
  add column if not exists gross_price numeric(12,2)
    generated always as (
      round(default_price + (default_price * tax_rate / 100), 2)
    ) stored;

create or replace function public.set_catalog_part_tax_rate()
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

drop trigger if exists service_catalog_parts_tax_rate_trigger
  on public.service_catalog_parts;

create trigger service_catalog_parts_tax_rate_trigger
before insert or update of default_price
on public.service_catalog_parts
for each row
execute function public.set_catalog_part_tax_rate();

update public.service_catalog_parts
set default_price = coalesce(default_price, 0);