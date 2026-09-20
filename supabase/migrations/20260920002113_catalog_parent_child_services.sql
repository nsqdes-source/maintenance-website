alter table public.service_catalog_items add column if not exists parent_id uuid references public.service_catalog_items(id) on delete restrict;
create index if not exists service_catalog_items_parent_idx on public.service_catalog_items(parent_id,sort_order);
