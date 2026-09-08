-- Assign a service request to an active technician in one atomic operation.
-- The caller must be an authorized management role.
-- Any previous pending/accepted assignment is cancelled before a new pending assignment is created.

CREATE OR REPLACE FUNCTION public.admin_assign_service_request(
  target_service_request_id uuid,
  target_technician_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor_role public.app_role;
  technician_active boolean;
  request_exists boolean;
  current_assignment_exists boolean;
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

  -- Serialize assignment changes for the same request so concurrent administrators
  -- cannot create two active assignments at the same time.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(target_service_request_id::text, 0)
  );

  SELECT EXISTS (
    SELECT 1 FROM public.service_requests WHERE id = target_service_request_id
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

  IF technician_active = false THEN
    RAISE EXCEPTION 'technician_inactive';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.service_request_assignments
    WHERE service_request_id = target_service_request_id
      AND technician_id = target_technician_id
      AND status IN ('pending', 'accepted')
  ) INTO current_assignment_exists;

  IF current_assignment_exists THEN
    RETURN;
  END IF;

  UPDATE public.service_request_assignments
  SET status = 'cancelled',
      responded_at = COALESCE(responded_at, now())
  WHERE service_request_id = target_service_request_id
    AND status IN ('pending', 'accepted');

  INSERT INTO public.service_request_assignments (
    service_request_id,
    technician_id,
    assigned_by,
    status,
    assigned_at,
    responded_at
  )
  VALUES (
    target_service_request_id,
    target_technician_id,
    auth.uid(),
    'pending',
    now(),
    NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_assign_service_request(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_service_request(uuid, uuid) TO authenticated;
