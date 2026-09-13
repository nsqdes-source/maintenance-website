-- Keep request status and technician assignments consistent for every terminal transition.
create or replace function public.finalize_closed_service_request_assignments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_service_request_workflow(new.id);
  return new;
end;
$$;

create trigger finalize_closed_service_request_assignments_trigger
after update of workflow_stage on public.service_requests
for each row
when (
  old.workflow_stage is distinct from new.workflow_stage
  and new.workflow_stage in ('completed', 'customer_rejected', 'customer_cancelled', 'cancelled')
)
execute function public.finalize_closed_service_request_assignments();

revoke all on function public.finalize_closed_service_request_assignments() from public, anon, authenticated;