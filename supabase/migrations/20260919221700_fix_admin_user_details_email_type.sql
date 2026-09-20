create or replace function public.admin_get_user_details(target_user_id uuid)
returns table(
  user_id uuid,
  full_name text,
  phone text,
  email text,
  role public.app_role,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then
    raise exception 'insufficient_privilege';
  end if;

  return query
  select p.id, p.full_name, p.phone, u.email::text, p.role, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = target_user_id;
end;
$$;

revoke all on function public.admin_get_user_details(uuid) from public, anon;
grant execute on function public.admin_get_user_details(uuid) to authenticated;
