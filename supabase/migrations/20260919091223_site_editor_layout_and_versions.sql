-- Safe, bounded visual controls. Arbitrary CSS is intentionally not stored.
alter table public.site_sections add column if not exists style_config jsonb not null default '{}'::jsonb;
alter table public.site_sections add constraint site_sections_style_config_object check (jsonb_typeof(style_config) = 'object');

create table public.site_editor_versions (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('draft','published')),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
alter table public.site_editor_versions enable row level security;
grant select, insert on public.site_editor_versions to authenticated;
create policy "site admins manage editor versions" on public.site_editor_versions for all to authenticated
using (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]))
with check (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));
