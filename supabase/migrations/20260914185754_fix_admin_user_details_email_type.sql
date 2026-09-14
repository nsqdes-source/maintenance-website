-- Fix admin user detail RPC: auth.users.email is varchar while the RPC returns text.
-- PL/pgSQL RETURN QUERY requires the returned column type to match the declared table type.

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
set search_path to public
as $$
begin
  if not public.current_user_has_role(
    array['maintenance_manager','admin_manager','super_admin']::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  return query
    select
      p.id,
      p.full_name,
      p.phone,
      u.email::text,
      p.role,
      p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = target_user_id;
end;
$$;
