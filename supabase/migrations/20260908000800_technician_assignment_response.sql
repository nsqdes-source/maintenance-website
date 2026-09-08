-- Let a technician accept or reject only their own pending assignment.
-- responded_at is maintained atomically with the assignment status.

CREATE OR REPLACE FUNCTION public.technician_respond_to_assignment(
  target_assignment_id uuid,
  new_status text,
  response_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  technician_user_id uuid;
  current_status text;
BEGIN
  IF new_status NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'invalid_assignment_response';
  END IF;

  SELECT t.profile_id, a.status
    INTO technician_user_id, current_status
  FROM public.service_request_assignments a
  JOIN public.technicians t ON t.id = a.technician_id
  WHERE a.id = target_assignment_id;

  IF technician_user_id IS NULL THEN
    RAISE EXCEPTION 'assignment_not_found';
  END IF;

  IF technician_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF current_status <> 'pending' THEN
    RAISE EXCEPTION 'assignment_not_pending';
  END IF;

  UPDATE public.service_request_assignments
  SET status = new_status,
      responded_at = now(),
      notes = nullif(trim(response_notes), '')
  WHERE id = target_assignment_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.technician_respond_to_assignment(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.technician_respond_to_assignment(uuid, text, text) TO authenticated;
