create or replace function public.notify_service_request_event()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  insert into public.notifications(
    recipient_id,
    service_request_id,
    event_id,
    title,
    body
  )
  select distinct
    recipient_id,
    new.service_request_id,
    new.id,
    case
      when new.to_stage = 'awaiting_customer_approval' then 'عرض إصلاح جديد'
      when new.to_stage = 'completed' then 'اكتمل طلب الصيانة'
      when new.to_stage = 'assigned' then 'تم إسناد الطلب'
      else 'تحديث طلب الصيانة'
    end,
    new.to_stage
  from (
    select r.customer_id as recipient_id
    from public.service_requests r
    where r.id = new.service_request_id

    union

    select p.id
    from public.profiles p
    where p.role in ('maintenance_manager','admin_manager','super_admin')

    union

    select t.profile_id
    from public.service_request_assignments a
    join public.technicians t
      on t.id = a.technician_id
    where a.service_request_id = new.service_request_id
      and a.status in ('pending','accepted')
  ) recipients
  where recipient_id is not null
    and recipient_id is distinct from new.actor_id

  on conflict do nothing;

  return new;
end;
$function$;