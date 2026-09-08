-- Keep profiles.role and technicians synchronized when administrators change roles.
-- Role changes are hierarchical: only a strictly higher role may change another user's role.
-- Technician transitions are handled in the same transaction as the profile change.

DROP FUNCTION IF EXISTS public.admin_update_user_role(uuid, public.app_role);

CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  target_user_id uuid,
  new_role public.app_role,
  new_service_types text[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor_role public.app_role;
  target_role public.app_role;
  target_technician_id uuid;
  actor_rank integer;
  target_rank integer;
  new_rank integer;
  active_assignment_exists boolean;
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = auth.uid();
  SELECT role INTO target_role FROM public.profiles WHERE id = target_user_id;

  IF actor_role IS NULL OR target_role IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_change_own_role';
  END IF;

  actor_rank := CASE actor_role
    WHEN 'customer'::public.app_role THEN 10
    WHEN 'technician'::public.app_role THEN 20
    WHEN 'maintenance_manager'::public.app_role THEN 30
    WHEN 'admin_manager'::public.app_role THEN 40
    WHEN 'super_admin'::public.app_role THEN 50
  END;

  target_rank := CASE target_role
    WHEN 'customer'::public.app_role THEN 10
    WHEN 'technician'::public.app_role THEN 20
    WHEN 'maintenance_manager'::public.app_role THEN 30
    WHEN 'admin_manager'::public.app_role THEN 40
    WHEN 'super_admin'::public.app_role THEN 50
  END;

  new_rank := CASE new_role
    WHEN 'customer'::public.app_role THEN 10
    WHEN 'technician'::public.app_role THEN 20
    WHEN 'maintenance_manager'::public.app_role THEN 30
    WHEN 'admin_manager'::public.app_role THEN 40
    WHEN 'super_admin'::public.app_role THEN 50
  END;

  IF actor_rank IS NULL OR target_rank IS NULL OR new_rank IS NULL THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  IF actor_role <> 'super_admin'::public.app_role
     AND (target_rank >= actor_rank OR new_rank >= actor_rank) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF new_role = 'technician'::public.app_role THEN
    IF coalesce(array_length(new_service_types, 1), 0) = 0 THEN
      RAISE EXCEPTION 'service_types_required';
    END IF;

    IF target_role IN (
      'maintenance_manager'::public.app_role,
      'admin_manager'::public.app_role,
      'super_admin'::public.app_role
    ) THEN
      RAISE EXCEPTION 'privileged_user_cannot_be_technician';
    END IF;

    SELECT id INTO target_technician_id
    FROM public.technicians
    WHERE profile_id = target_user_id;

    IF target_technician_id IS NULL THEN
      INSERT INTO public.technicians (profile_id, service_types, is_active, notes)
      VALUES (target_user_id, new_service_types, true, NULL);
    ELSE
      UPDATE public.technicians
      SET service_types = new_service_types,
          is_active = true,
          updated_at = now()
      WHERE id = target_technician_id;
    END IF;
  ELSIF target_role = 'technician'::public.app_role THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.service_request_assignments
      WHERE technician_id = target_technician_id
        AND status IN ('pending', 'accepted')
    ) INTO active_assignment_exists;

    IF active_assignment_exists THEN
      RAISE EXCEPTION 'technician_has_active_assignments';
    END IF;

    UPDATE public.technicians
    SET is_active = false,
        updated_at = now()
    WHERE profile_id = target_user_id;
  END IF;

  UPDATE public.profiles
  SET role = new_role,
      updated_at = now()
  WHERE id = target_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_user_role(uuid, public.app_role, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(uuid, public.app_role, text[]) TO authenticated;

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
  target_profile_id uuid;
  current_target_role public.app_role;
  actor_rank integer;
  target_rank integer;
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = auth.uid();

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

  SELECT t.profile_id, p.role
    INTO target_profile_id, current_target_role
  FROM public.technicians t
  JOIN public.profiles p ON p.id = t.profile_id
  WHERE t.id = target_technician_id;

  IF target_profile_id IS NULL THEN
    RAISE EXCEPTION 'technician_not_found';
  END IF;

  actor_rank := CASE actor_role
    WHEN 'maintenance_manager'::public.app_role THEN 30
    WHEN 'admin_manager'::public.app_role THEN 40
    WHEN 'super_admin'::public.app_role THEN 50
    ELSE 0
  END;

  target_rank := CASE current_target_role
    WHEN 'customer'::public.app_role THEN 10
    WHEN 'technician'::public.app_role THEN 20
    WHEN 'maintenance_manager'::public.app_role THEN 30
    WHEN 'admin_manager'::public.app_role THEN 40
    WHEN 'super_admin'::public.app_role THEN 50
    ELSE 0
  END;

  IF target_is_active = true AND current_target_role <> 'technician'::public.app_role THEN
    IF target_rank >= actor_rank THEN
      RAISE EXCEPTION 'insufficient_privilege';
    END IF;
    UPDATE public.profiles
    SET role = 'technician'::public.app_role,
        updated_at = now()
    WHERE id = target_profile_id;
  END IF;

  UPDATE public.technicians
  SET service_types = target_service_types,
      is_active = target_is_active,
      notes = nullif(trim(target_notes), ''),
      updated_at = now()
  WHERE id = target_technician_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_technician(uuid, text[], boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_technician(uuid, text[], boolean, text) TO authenticated;
