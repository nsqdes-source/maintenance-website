-- Assign a service request to an active technician.
-- Existing pending/accepted assignments for the same request are cancelled first.

CREATE OR REPLACE FUNCTION public.admin_assign_service_request(
  target_request_id uuid,
  target_technician_id uuid,
  assignment_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor_role public.app_role;
  request_exists boolean;
  technician_active boolean;
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

  SELECT EXISTS (
    SELECT 1 FROM public.service_requests WHERE id = target_request_id
  ) INTO request_exists;

  IF NOT request_exists THEN
    RAISE EXCEPTION 'service_request_not_found';
  END IF;

  SELECT is_active INTO technician_active
  FROM public.technicians
  WHERE id = target_technician_id;

  IF technician_active IS NULL THEN
    RAISE EXCEPTION 'technician_not_found';
  END IF;

  IF NOT technician_active THEN
    RAISE EXCEPTION 'technician_inactive';
  END IF;

  UPDATE public.service_request_assignments
  SET status = 'cancelled',
      responded_at = COALESCE(responded_at, now())
  WHERE service_request_id = target_request_id
    AND status IN ('pending', 'accepted');

  INSERT INTO public.service_request_assignments (
    service_request_id,
    technician_id,
    assigned_by,
    status,
    assigned_at,
    responded_at,
    notes
  )
  VALUES (
    target_request_id,
    target_technician_id,
    auth.uid(),
    'pending',
    now(),
    NULL,
    nullif(trim(assignment_notes), '')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_assign_service_request(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_service_request(uuid, uuid, text) TO authenticated;
