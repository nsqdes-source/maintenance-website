-- Optional administrator-controlled Drive copies. Supabase remains the source of truth.
create table public.drive_connection (
 id boolean primary key default true check (id),
 refresh_token_ciphertext text not null,
 folder_id text not null,
 connected_at timestamptz not null default now()
);
alter table public.drive_connection enable row level security;
create policy drive_connection_managers on public.drive_connection for all to authenticated
 using (public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]))
 with check (public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]));
grant select,insert,update,delete on public.drive_connection to authenticated;
create table public.drive_syncs (
 id uuid primary key default gen_random_uuid(),
 source_type text not null check(source_type in ('invoice','request_image')),
 source_id uuid not null,
 drive_file_id text not null,
 synced_at timestamptz not null default now(),
 unique(source_type,source_id)
);
alter table public.drive_syncs enable row level security;
create policy drive_syncs_managers on public.drive_syncs for all to authenticated
 using (public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]))
 with check (public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]));
grant select,insert,update,delete on public.drive_syncs to authenticated;
