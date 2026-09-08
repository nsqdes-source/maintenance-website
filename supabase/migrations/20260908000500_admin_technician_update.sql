-- Allow authorized staff to update a technician's operational details.
-- Role changes are handled separately through admin_update_user_role.

CREATE OR REPLACE FUNCTION public.admin_update_technician(
  target_technician_id uuid,
  target_service_types text[],
  target_is_active boolean,
  target_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor_role public.app_role;
BEGIN
  SELECT role INTO actor_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF actor_role IS NULL OR actor_role NOT IN (
    'maintenance_manager'::public.app_role,
    'admin_manager'::public.app_role,
    'super_admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF coalesce(array_length(target_service_types, 1), 0) = 0 THEN
    RAISE EXCEPTION 'service_types_required';
  END IF;

  UPDATE public.technicians
  SET service_types = target_service_types,
      is_active = target_is_active,
      notes = nullif(trim(target_notes), ''),
      updated_at = now()
  WHERE id = target_technician_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'technician_not_found';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_technician(uuid, text[], boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_technician(uuid, text[], boolean, text) TO authenticated;
