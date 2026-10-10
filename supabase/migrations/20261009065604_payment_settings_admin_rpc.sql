BEGIN;
CREATE FUNCTION public.finance_save_payment_settings(p_policy jsonb, p_expected_policy_version bigint, p_gateway_provider text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.business_finance_settings%ROWTYPE; provider text; next_version bigint;
BEGIN
 IF NOT public.current_user_has_role(ARRAY['admin_manager','super_admin']::public.app_role[]) THEN
  RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501';
 END IF;
 SELECT * INTO s FROM public.business_finance_settings WHERE id=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'finance_settings_not_initialized'; END IF;
 IF s.payment_domain_enabled OR s.gateway_enabled THEN RAISE EXCEPTION 'payment_settings_phase3_gate_closed'; END IF;
 IF p_expected_policy_version IS DISTINCT FROM s.payment_policy_version THEN RAISE EXCEPTION 'payment_policy_version_conflict'; END IF;
 IF NOT coalesce(private.payment_policy_v1_is_valid(p_policy),false) THEN RAISE EXCEPTION 'invalid_payment_policy_v1'; END IF;
 provider:=btrim(p_gateway_provider);
 IF provider IS NOT NULL AND (char_length(provider) NOT BETWEEN 1 AND 100 OR provider !~ '^[[:alnum:] _.-]+$') THEN
  RAISE EXCEPTION 'invalid_gateway_provider';
 END IF;
 -- A provider identifier only: reject obvious credential prefixes, never record its value in audit.
 IF provider ~* '(^|[ _.-])(sk_|pk_|secret|password|token|api[ _-]?key|webhook|credential)' THEN RAISE EXCEPTION 'invalid_gateway_provider'; END IF;
 next_version:=s.payment_policy_version;
 IF s.payment_policy IS DISTINCT FROM p_policy THEN next_version:=next_version+1; END IF;
 IF s.payment_policy IS NOT DISTINCT FROM p_policy AND s.gateway_provider IS NOT DISTINCT FROM provider AND s.gateway_environment='test' THEN RETURN next_version; END IF;
 UPDATE public.business_finance_settings SET payment_policy=p_policy,payment_policy_version=next_version,
  gateway_provider=provider,gateway_environment='test',updated_at=now() WHERE id=true;
 PERFORM private.payment_write_audit_event('payment_settings_updated','business_finance_settings',NULL,NULL,NULL,
  jsonb_build_object('policy_changed',s.payment_policy IS DISTINCT FROM p_policy,'policy_version',next_version,'provider_changed',s.gateway_provider IS DISTINCT FROM provider));
 RETURN next_version;
END $$;
REVOKE ALL ON FUNCTION public.finance_save_payment_settings(jsonb,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.finance_save_payment_settings(jsonb,bigint,text) TO authenticated;
COMMIT;
