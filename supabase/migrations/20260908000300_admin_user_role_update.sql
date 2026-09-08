-- Allow authorized staff to change a user's application role.
-- Privileged roles remain protected: only super_admin may grant admin_manager or super_admin.

CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  target_user_id uuid,
  new_role public.app_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor_role public.app_role;
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = auth.uid();

  IF actor_role IS NULL OR actor_role NOT IN (
    'maintenance_manager'::public.app_role,
    'admin_manager'::public.app_role,
    'super_admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_change_own_role';
  END IF;

  IF new_role IN ('admin_manager'::public.app_role, 'super_admin'::public.app_role)
     AND actor_role <> 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  UPDATE public.profiles
  SET role = new_role,
      updated_at = now()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_user_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(uuid, public.app_role) TO authenticated;
