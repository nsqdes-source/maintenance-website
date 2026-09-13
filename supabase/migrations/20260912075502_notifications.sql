create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 service_request_id uuid not null references public.service_requests(id) on delete cascade,
 event_id uuid not null references public.service_request_events(id) on delete cascade,
 title text not null,
 body text,
 read_at timestamptz,
 created_at timestamptz not null default now(),
 unique(event_id,recipient_id)
);
create index notifications_recipient_idx on public.notifications(recipient_id,read_at,created_at desc);
alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
create policy "read own notifications" on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()));
create or replace function public.notify_service_request_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
 insert into public.notifications(recipient_id,service_request_id,event_id,title,body)
 select distinct recipient_id,new.service_request_id,new.id,
  case when new.to_stage = 'awaiting_customer_approval' then 'عرض إصلاح جديد'
   when new.to_stage = 'completed' then 'اكتمل طلب الصيانة'
   when new.to_stage = 'assigned' then 'تم إسناد الطلب'
   else 'تحديث طلب الصيانة' end,
  new.to_stage
 from (
  select r.customer_id as recipient_id from public.service_requests r where r.id = new.service_request_id
  union
  select p.id from public.profiles p where p.role in ('maintenance_manager','admin_manager','super_admin')
  union
  select t.profile_id from public.service_request_assignments a join public.technicians t on t.id = a.technician_id
   where a.service_request_id = new.service_request_id and a.status in ('pending','accepted')
 ) recipients
 where recipient_id is not null and recipient_id is distinct from new.actor_id
 on conflict(event_id,recipient_id) do nothing;
 return new;
end; $$;
create trigger service_request_event_notification_trigger after insert on public.service_request_events
for each row execute function public.notify_service_request_event();
revoke all on function public.notify_service_request_event() from public,anon,authenticated;
create or replace function public.mark_notification_read(target_notification_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
 update public.notifications set read_at = coalesce(read_at,now())
 where id = target_notification_id and recipient_id = auth.uid();
 if not found then raise exception 'notification_not_found'; end if;
end; $$;
revoke all on function public.mark_notification_read(uuid) from public,anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
create or replace function public.log_new_service_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
 insert into public.service_request_events(service_request_id,actor_id,event_type,to_stage)
 values(new.id,auth.uid(),'request_created',new.workflow_stage);
 return new;
end; $$;
create trigger service_request_created_event_trigger after insert on public.service_requests
for each row execute function public.log_new_service_request();
revoke all on function public.log_new_service_request() from public,anon,authenticated;
revoke all on table public.notifications from public,anon,authenticated;
grant select on table public.notifications to authenticated;
