create or replace function public.finance_get_invoice_list_summary()
returns table(
  total_invoice_count bigint,
  issued_invoice_count bigint,
  issued_total numeric,
  issued_collected_total numeric,
  issued_outstanding_total numeric,
  fully_paid_draft_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_issued_total numeric := 0;
  v_issued_collected numeric := 0;
begin
  if not public.current_user_has_role(
    array['admin_manager','super_admin']::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  select
    count(*),
    count(*) filter (where i.status = 'issued'),
    coalesce(sum(i.total) filter (where i.status = 'issued'), 0)
  into
    total_invoice_count,
    issued_invoice_count,
    v_issued_total
  from public.invoices i;

  select coalesce(sum(p.amount), 0)
  into v_issued_collected
  from public.invoice_payments p
  join public.invoices i on i.id = p.invoice_id
  where i.status = 'issued'
    and p.voided_at is null;

  select count(*)
  into fully_paid_draft_count
  from public.invoices i
  where i.status = 'draft'
    and i.total > 0
    and coalesce(
      (
        select sum(p.amount)
        from public.invoice_payments p
        where p.invoice_id = i.id
          and p.voided_at is null
      ),
      0
    ) >= i.total;

  issued_total := v_issued_total;
  issued_collected_total := v_issued_collected;
  issued_outstanding_total := greatest(0, v_issued_total - v_issued_collected);

  return next;
end;
$function$;

revoke all on function public.finance_get_invoice_list_summary() from public;
grant execute on function public.finance_get_invoice_list_summary() to authenticated;
