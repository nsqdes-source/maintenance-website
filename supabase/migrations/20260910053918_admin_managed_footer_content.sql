create table if not exists public.site_footer_content (
  id boolean primary key default true check (id = true),
  company_name text not null default 'خدمات الصيانة العامة',
  description text not null default 'خدمات صيانة عامة موثوقة وسريعة.',
  phone text,
  email text,
  address text,
  copyright_text text not null default '© 2026 جميع الحقوق محفوظة',
  updated_at timestamptz not null default now()
);

alter table public.site_footer_content enable row level security;

create policy "Public can read footer content"
  on public.site_footer_content
  for select
  to anon, authenticated
  using (true);

create policy "Admins can insert footer content"
  on public.site_footer_content
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('maintenance_manager', 'admin_manager', 'super_admin')
    )
  );

create policy "Admins can update footer content"
  on public.site_footer_content
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('maintenance_manager', 'admin_manager', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('maintenance_manager', 'admin_manager', 'super_admin')
    )
  );

insert into public.site_footer_content (id)
values (true)
on conflict (id) do nothing;

create or replace function public.set_site_footer_content_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_footer_content_updated_at on public.site_footer_content;
create trigger site_footer_content_updated_at
before update on public.site_footer_content
for each row execute function public.set_site_footer_content_updated_at();
