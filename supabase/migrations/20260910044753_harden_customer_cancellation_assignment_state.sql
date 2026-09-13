create or replace function public.customer_cancel_service_request(target_service_request_id uuid, cancellation_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare current_stage text;
begin
  select workflow_stage into current_stage
  from public.service_requests
  where id = target_service_request_id and customer_id = auth.uid()
  for update;

  if not found then raise exception 'request_not_found'; end if;
  if current_stage in ('completed','cancelled','customer_rejected','customer_cancelled') then
    raise exception 'request_already_closed';
  end if;
  if current_stage = 'technician_accepted' then
    raise exception 'technician_already_accepted';
  end if;

  update public.service_requests
  set workflow_stage = 'customer_cancelled',
      status = 'cancelled',
      visit_notes = case
        when nullif(trim(cancellation_reason), '') is null then visit_notes
        when visit_notes is null then 'إلغاء العميل: ' || trim(cancellation_reason)
        else visit_notes || E'\nإلغاء العميل: ' || trim(cancellation_reason)
      end,
      workflow_updated_at = now()
  where id = target_service_request_id;

  update public.service_request_assignments
  set status = 'cancelled',
      responded_at = coalesce(responded_at, now()),
      notes = case
        when nullif(trim(cancellation_reason), '') is null then notes
        when notes is null then 'إلغاء العميل: ' || trim(cancellation_reason)
        else notes || E'\nإلغاء العميل: ' || trim(cancellation_reason)
      end
  where service_request_id = target_service_request_id
    and status = 'pending';
end;
$$;

grant execute on function public.customer_cancel_service_request(uuid,text) to authenticated;
