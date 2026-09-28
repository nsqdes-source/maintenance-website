-- Fix mismatch between technician_record_visit_outcome() and the table constraint.
-- The RPC accepts reschedule_requested and unable_to_complete, so the
-- service_requests.visit_outcome constraint must allow the same values.

alter table public.service_requests
  drop constraint if exists service_requests_visit_outcome_check;

alter table public.service_requests
  add constraint service_requests_visit_outcome_check
  check (
    visit_outcome is null
    or visit_outcome in (
      'completed',
      'needs_followup',
      'customer_rejected',
      'reschedule_requested',
      'unable_to_complete'
    )
  );
