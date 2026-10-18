CREATE FUNCTION public.gateway_get_runtime_config()
RETURNS TABLE(
  payment_domain_enabled boolean,
  gateway_enabled boolean,
  provider text,
  environment text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path='' AS $$
  SELECT
    s.payment_domain_enabled,
    s.gateway_enabled,
    s.gateway_provider,
    s.gateway_environment
  FROM public.business_finance_settings s
  WHERE s.id=true;
$$;

REVOKE ALL ON FUNCTION public.gateway_get_runtime_config()
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_get_runtime_config()
TO service_role;
