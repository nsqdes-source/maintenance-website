-- Allow authorized staff to add a registered profile as a technician in one atomic operation.
-- The target becomes the technician role and receives a technicians row.

CREATE OR REPLACE FUNCTION public.admin_add_technician(
  target_profile_id uuid,
  target_service_types text[],
  target_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor_role public.app_role;
  target_role public.app_role;
BEGIN
  SELECT role
    INTO actor_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF actor_role IS NULL OR actor_role NOT IN (
    'maintenance_manager'::public.app_role,
    'admin_manager'::public.app_role,
    'super_admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF target_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_add_self_as_technician';
  END IF;

  IF coalesce(array_length(target_service_types, 1), 0) = 0 THEN
    RAISE EXCEPTION 'service_types_required';
  END IF;

  SELECT role
    INTO target_role
  FROM public.profiles
  WHERE id = target_profile_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF target_role IN (
    'maintenance_manager'::public.app_role,
    'admin_manager'::public.app_role,
    'super_admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'privileged_user_cannot_be_technician';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.technicians
    WHERE profile_id = target_profile_id
  ) THEN
    RAISE EXCEPTION 'technician_already_exists';
  END IF;

  UPDATE public.profiles
  SET role = 'technician'::public.app_role,
      updated_at = now()
  WHERE id = target_profile_id;

  INSERT INTO public.technicians (profile_id, service_types, is_active, notes)
  VALUES (target_profile_id, target_service_types, true, nullif(trim(target_notes), ''));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_add_technician(uuid, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_technician(uuid, text[], text) TO authenticated;
