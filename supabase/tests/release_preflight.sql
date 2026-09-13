-- Read-only release checks. Compare target migration history with this repository first.
-- Assumes the existing schema through 20260910100000_customer_request_cancellation_workflow.sql.
-- The report contains counts only. Resolve nonzero blockers before migrating.
begin transaction read only;

with normalized_phones as (
  select case
    when digits ~ '^05[0-9]{8}$' then '966' || substr(digits, 2)
    when digits ~ '^9665[0-9]{8}$' then digits
    when digits ~ '^5[0-9]{8}$' then '966' || digits
    else null
  end as normalized, phone
  from public.profiles p
  cross join lateral (select regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') as digits) d
), duplicate_phones as (
  select normalized from normalized_phones
  where normalized is not null
  group by normalized having count(*) > 1
)
select 'duplicate_normalized_mobile_groups' as check_name, count(*)::bigint as rows_found
from duplicate_phones
union all
select 'invalid_existing_profile_mobiles', count(*)::bigint
from normalized_phones where nullif(trim(phone), '') is not null and normalized is null
union all
select 'unsupported_request_workflow_stages', count(*)::bigint
from public.service_requests
where workflow_stage is null or workflow_stage not in (
  'awaiting_assignment', 'assigned', 'technician_accepted', 'in_progress',
  'completed', 'needs_followup', 'awaiting_admin_quote',
  'awaiting_customer_approval', 'quote_approved', 'customer_rejected',
  'customer_cancelled', 'cancelled'
)
union all
select 'unsupported_assignment_statuses', count(*)::bigint
from public.service_request_assignments
where status is null or status not in ('pending', 'accepted', 'rejected', 'cancelled', 'completed')
union all
select 'conflicting_existing_storage_buckets', count(*)::bigint
from storage.buckets
where (id = 'avatars' and (public is distinct from false or file_size_limit is distinct from 2097152))
   or (id = 'request-images' and (public is distinct from false or file_size_limit is distinct from 5242880))
order by check_name;

select 'existing_service_requests' as metric, count(*)::bigint as rows_found
from public.service_requests
union all
select 'existing_profiles', count(*)::bigint from public.profiles
union all
select 'existing_assignments', count(*)::bigint from public.service_request_assignments
order by metric;

rollback;