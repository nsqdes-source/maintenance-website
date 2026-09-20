-- Configurable, structured display settings for customer and technician dashboards.
-- Card order and visibility are presentation-only; workflow permissions remain in the application and RLS policies.
create table public.dashboard_display_settings (
  id boolean primary key default true check (id),
  customer_cards jsonb not null default '[{"id":"new_request","visible":true},{"id":"requests","visible":true}]'::jsonb,
  technician_cards jsonb not null default '[{"id":"summary","visible":true},{"id":"assignments","visible":true}]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint dashboard_display_customer_cards_array check (jsonb_typeof(customer_cards) = 'array'),
  constraint dashboard_display_technician_cards_array check (jsonb_typeof(technician_cards) = 'array')
);

alter table public.dashboard_display_settings enable row level security;
revoke all on public.dashboard_display_settings from public, anon, authenticated;
grant select on public.dashboard_display_settings to authenticated;
grant insert, update on public.dashboard_display_settings to authenticated;

create policy "authenticated users read dashboard display settings"
on public.dashboard_display_settings for select to authenticated using (true);
create policy "site administrators edit dashboard display settings"
on public.dashboard_display_settings for all to authenticated
using (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]))
with check (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));

insert into public.dashboard_display_settings (id) values (true)
on conflict (id) do nothing;
