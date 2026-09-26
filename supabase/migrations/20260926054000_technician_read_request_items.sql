-- Allow a technician to read priced request items
-- only for service requests assigned to that technician.

create policy "assigned technicians read service request items"
  on public.service_request_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.service_request_assignments assignment
      join public.technicians technician
        on technician.id = assignment.technician_id
      where assignment.service_request_id =
        service_request_items.service_request_id
        and technician.profile_id = auth.uid()
        and assignment.status in (
          'pending',
          'accepted',
          'completed'
        )
    )
  );