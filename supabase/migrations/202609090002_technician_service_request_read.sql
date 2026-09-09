-- Allow technicians to read service requests assigned to them.
-- This is intentionally limited to the technician's own assignments.

create policy "assigned technicians can read their service requests"
on public.service_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.service_request_assignments a
    join public.technicians t on t.id = a.technician_id
    where a.service_request_id = service_requests.id
      and t.profile_id = auth.uid()
  )
);
