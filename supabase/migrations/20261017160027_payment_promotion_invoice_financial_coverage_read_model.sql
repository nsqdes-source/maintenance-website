-- Finance-only canonical invoice coverage read model.
-- Additive hardening: removes authenticated UI dependency on direct payment_refunds SELECT.
CREATE FUNCTION public.finance_get_invoice_financial_coverage()
RETURNS TABLE(
  invoice_id uuid,
  invoice_status text,
  invoice_total numeric,
  gross_received numeric,
  succeeded_refunds numeric,
  net_received numeric,
  remaining numeric,
  is_fully_covered boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
BEGIN
  PERFORM private.payment_foundation_require_finance();

  RETURN QUERY
  WITH payment_totals AS (
    SELECT ip.invoice_id, round(coalesce(sum(ip.amount),0),2) AS gross_received
    FROM public.invoice_payments ip
    WHERE ip.voided_at IS NULL
    GROUP BY ip.invoice_id
  ),
  refund_totals AS (
    SELECT pr.service_request_id, round(coalesce(sum(pr.amount),0),2) AS succeeded_refunds
    FROM public.payment_refunds pr
    WHERE pr.status='succeeded'
    GROUP BY pr.service_request_id
  )
  SELECT
    i.id,
    i.status,
    i.total,
    coalesce(p.gross_received,0)::numeric,
    coalesce(r.succeeded_refunds,0)::numeric,
    greatest(0,round(coalesce(p.gross_received,0)-coalesce(r.succeeded_refunds,0),2))::numeric,
    CASE
      WHEN i.status='void' THEN 0::numeric
      ELSE greatest(
        0,
        round(
          i.total-greatest(0,coalesce(p.gross_received,0)-coalesce(r.succeeded_refunds,0)),
          2
        )
      )::numeric
    END,
    (
      i.status<>'void'
      AND i.total>0
      AND greatest(0,round(coalesce(p.gross_received,0)-coalesce(r.succeeded_refunds,0),2))>=i.total
    )
  FROM public.invoices i
  LEFT JOIN payment_totals p ON p.invoice_id=i.id
  LEFT JOIN refund_totals r ON r.service_request_id=i.service_request_id
  ORDER BY i.created_at DESC,i.id;
END $$;

REVOKE ALL ON FUNCTION public.finance_get_invoice_financial_coverage()
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finance_get_invoice_financial_coverage()
TO authenticated;
