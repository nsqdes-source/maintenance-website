CREATE OR REPLACE FUNCTION public.finance_get_refund_operations(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  v_enabled boolean:=false;
  v_rows jsonb;
BEGIN
  PERFORM private.payment_foundation_require_finance();

  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'invalid_pagination';
  END IF;

  v_enabled:=coalesce(
    (
      SELECT payment_domain_enabled
      FROM public.business_finance_settings
      WHERE id=true
    ),
    false
  );

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',r.id,
        'service_request_id',r.service_request_id,
        'invoice_id',r.invoice_id,
        'amount',r.amount,
        'currency',r.currency,
        'status',r.status,
        'reason',r.reason,
        'note',r.note,
        'provider',r.provider,
        'provider_refund_id',r.provider_refund_id,
        'requested_at',r.requested_at,
        'approved_at',r.approved_at,
        'completed_at',r.completed_at,
        'failure_code',r.failure_code,
        'origin_type',
          case
            when r.origin_service_request_payment_id is not null
              then 'service_request_payment'
            else 'invoice_payment'
          end,
        'origin_id',
          coalesce(r.origin_service_request_payment_id,r.origin_invoice_payment_id),
        'origin_amount',
          coalesce(rp.amount,ip.amount),
        'origin_method',
          coalesce(rp.method,ip.method),
        'origin_paid_at',
          coalesce(rp.paid_at,ip.paid_at),
        'invoice_number',i.invoice_number,
        'customer_name',
          coalesce(i.customer_name,sr.customer_name),
        'can_decide',
          (r.status='requested'),
        'can_cancel',
          (r.status in ('requested','approved')),
        'provider_processing_state',
          case
            when r.provider is null then 'manual'
            when r.status='approved' then 'ready_for_provider'
            when r.status='pending' then 'provider_pending'
            when r.status in ('succeeded','failed') then 'provider_terminal'
            else 'not_ready'
          end
      )
      order by r.requested_at desc,r.id desc
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT *
    FROM public.payment_refunds
    ORDER BY requested_at DESC,id DESC
    LIMIT p_limit OFFSET p_offset
  ) r
  JOIN public.service_requests sr
    ON sr.id=r.service_request_id
  LEFT JOIN public.service_request_payments rp
    ON rp.id=r.origin_service_request_payment_id
  LEFT JOIN public.invoice_payments ip
    ON ip.id=r.origin_invoice_payment_id
  LEFT JOIN public.invoices i
    ON i.id=coalesce(r.invoice_id,ip.invoice_id);

  RETURN jsonb_build_object(
    'payment_domain_enabled',v_enabled,
    'refunds',v_rows,
    'limit',p_limit,
    'offset',p_offset
  );
END $$;

REVOKE ALL ON FUNCTION public.finance_get_refund_operations(integer,integer)
FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.finance_get_refund_operations(integer,integer)
TO authenticated;
