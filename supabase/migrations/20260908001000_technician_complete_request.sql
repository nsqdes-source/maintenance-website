-- Let the assigned technician mark their own accepted service request as completed.
-- The stored request status remains the existing `completed` value; the technician-facing
-- label is `منتهي`.

CREATE OR REPLACE FUNCTION public.technician_complete_service_request(
  target_service_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_technician_id uuid;
  assignment_found boolean;
  request_status text;
BEGIN
  SELECT id
    INTO current_technician_id
  FROM public.technicians
  WHERE profile_id = auth.uid()
    AND is_active = true;

  IF current_technician_id IS NULL THEN
    RAISE EXCEPTION 'technician_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.service_request_assignments a
    WHERE a.service_request_id = target_service_request_id
      AND a.technician_id = current_technician_id
      AND a.status = 'accepted'
  ),
  r.status
  INTO assignment_found, request_status
  FROM public.service_requests r
  WHERE r.id = target_service_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_request_not_found';
  END IF;

  IF NOT assignment_found THEN
    RAISE EXCEPTION 'accepted_assignment_not_found';
  END IF;

  IF request_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'request_already_closed';
  END IF;

  UPDATE public.service_requests
  SET status = 'completed'
  WHERE id = target_service_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.technician_complete_service_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.technician_complete_service_request(uuid) TO authenticated;
