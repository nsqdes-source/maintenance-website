-- Payment Migration 1. Test apply authorized ONLY on wsjmaojgjzxkmxywvcfy.
-- No historical backfill, payment posting, gateway activation or workflow changes.
BEGIN;

ALTER TABLE public.business_finance_settings
  ADD COLUMN payment_policy jsonb NOT NULL DEFAULT '{"schema_version":1,"original_timing":"customer_choice","allow_pay_on_arrival":true,"allow_pay_after_completion":true,"additional_timing":"customer_choice","allow_work_before_balance":true,"allowed_methods":["cash","bank_transfer","card","other"],"inspection_included_in_final":true,"retain_earned_inspection_on_rejection":true,"refund_excess":true}'::jsonb,
  ADD COLUMN payment_policy_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN payment_domain_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN gateway_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN gateway_provider text,
  ADD COLUMN gateway_environment text NOT NULL DEFAULT 'test',
  ADD CONSTRAINT business_finance_payment_policy_version_chk CHECK (payment_policy_version > 0),
  ADD CONSTRAINT business_finance_payment_policy_object_chk CHECK (jsonb_typeof(payment_policy)='object' AND pg_column_size(payment_policy)<=4096),
  ADD CONSTRAINT business_finance_gateway_environment_chk CHECK (gateway_environment IN ('test','live')),
  ADD CONSTRAINT business_finance_gateway_provider_chk CHECK (gateway_provider IS NULL OR char_length(btrim(gateway_provider)) BETWEEN 1 AND 100),
  ADD CONSTRAINT business_finance_gateway_enabled_provider_chk CHECK (NOT gateway_enabled OR gateway_provider IS NOT NULL);

ALTER TABLE public.service_requests
  ADD COLUMN payment_policy_snapshot jsonb,
  ADD COLUMN payment_choice_timing text,
  ADD COLUMN payment_choice_method text,
  ADD COLUMN payment_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN payment_domain_version smallint NOT NULL DEFAULT 0,
  ADD COLUMN inspection_confirmed_at timestamptz,
  ADD COLUMN inspection_confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN inspection_earned_amount numeric(12,2),
  ADD COLUMN work_started_at timestamptz,
  ADD COLUMN work_started_basis text,
  ADD CONSTRAINT service_requests_payment_snapshot_shape_chk CHECK (payment_policy_snapshot IS NULL OR (jsonb_typeof(payment_policy_snapshot)='object' AND pg_column_size(payment_policy_snapshot)<=8192)),
  ADD CONSTRAINT service_requests_payment_choice_timing_chk CHECK (payment_choice_timing IS NULL OR payment_choice_timing IN ('prepay','pay_on_arrival','pay_after_completion')),
  ADD CONSTRAINT service_requests_payment_choice_method_chk CHECK (payment_choice_method IS NULL OR payment_choice_method IN ('cash','bank_transfer','card','other')),
  ADD CONSTRAINT service_requests_payment_revision_chk CHECK (payment_revision >= 0),
  ADD CONSTRAINT service_requests_payment_domain_version_chk CHECK (payment_domain_version IN (0,1)),
  ADD CONSTRAINT service_requests_inspection_earned_amount_chk CHECK (inspection_earned_amount IS NULL OR (inspection_earned_amount >= 0 AND inspection_earned_amount <> 'NaN'::numeric)),
  ADD CONSTRAINT service_requests_work_started_basis_chk CHECK (work_started_basis IS NULL OR char_length(btrim(work_started_basis)) BETWEEN 1 AND 200);

ALTER TABLE public.service_request_items
  ADD COLUMN is_visit_service_snapshot boolean,
  ADD COLUMN classification_source text,
  ADD COLUMN classification_recorded_at timestamptz,
  ADD COLUMN classification_recorded_by uuid,
  ADD CONSTRAINT service_request_items_classification_evidence_chk CHECK (
    (is_visit_service_snapshot IS NULL AND classification_source IS NULL AND classification_recorded_at IS NULL AND classification_recorded_by IS NULL)
    OR (is_visit_service_snapshot IS NOT NULL AND classification_source IN ('catalog_at_insert','legacy_verified') AND classification_source IS NOT NULL AND classification_recorded_at IS NOT NULL));
ALTER TABLE public.service_request_change_items
  ADD COLUMN is_visit_service_snapshot boolean,
  ADD COLUMN classification_source text,
  ADD COLUMN classification_recorded_at timestamptz,
  ADD COLUMN classification_recorded_by uuid,
  ADD CONSTRAINT service_request_change_items_classification_evidence_chk CHECK (
    (is_visit_service_snapshot IS NULL AND classification_source IS NULL AND classification_recorded_at IS NULL AND classification_recorded_by IS NULL)
    OR (is_visit_service_snapshot IS NOT NULL AND classification_source IN ('catalog_at_insert','legacy_verified') AND classification_source IS NOT NULL AND classification_recorded_at IS NOT NULL));

-- Internal validation only; no caller receives a new EXECUTE grant.
CREATE FUNCTION private.payment_policy_v1_is_valid(policy jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE field text; methods_count integer; distinct_methods integer;
BEGIN
 IF policy IS NULL OR jsonb_typeof(policy) <> 'object' OR pg_column_size(policy)>4096 THEN RETURN false; END IF;
 IF NOT policy ?& ARRAY['schema_version','original_timing','allow_pay_on_arrival','allow_pay_after_completion','additional_timing','allow_work_before_balance','allowed_methods','inspection_included_in_final','retain_earned_inspection_on_rejection','refund_excess']
    OR (SELECT count(*) FROM jsonb_object_keys(policy))<>10 THEN RETURN false; END IF;
 IF jsonb_typeof(policy->'original_timing') <> 'string' OR jsonb_typeof(policy->'additional_timing') <> 'string' OR policy->'schema_version' <> '1'::jsonb
    OR policy->>'original_timing' NOT IN ('customer_choice','prepay_required','pay_on_arrival','pay_after_completion')
    OR policy->>'additional_timing' NOT IN ('customer_choice','before_execution','after_execution') THEN RETURN false; END IF;
 FOREACH field IN ARRAY ARRAY['allow_pay_on_arrival','allow_pay_after_completion','allow_work_before_balance','inspection_included_in_final','retain_earned_inspection_on_rejection','refund_excess'] LOOP
  IF jsonb_typeof(policy->field)<>'boolean' THEN RETURN false; END IF;
 END LOOP;
 IF policy->'inspection_included_in_final'<>'true'::jsonb OR policy->'retain_earned_inspection_on_rejection'<>'true'::jsonb OR policy->'refund_excess'<>'true'::jsonb THEN RETURN false; END IF;
 IF policy->>'original_timing'='pay_on_arrival' AND policy->'allow_pay_on_arrival'='false'::jsonb
    OR policy->>'original_timing'='pay_after_completion' AND policy->'allow_pay_after_completion'='false'::jsonb THEN RETURN false; END IF;
 IF jsonb_typeof(policy->'allowed_methods')<>'array' THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'allowed_methods') v WHERE jsonb_typeof(v)<>'string' OR v#>>'{}' NOT IN ('cash','bank_transfer','card','other')) THEN RETURN false; END IF;
 SELECT count(*),count(DISTINCT v) INTO methods_count,distinct_methods FROM jsonb_array_elements(policy->'allowed_methods') v;
 RETURN methods_count BETWEEN 1 AND 4 AND methods_count=distinct_methods;
END $fn$;

CREATE FUNCTION private.payment_validate_settings_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
 IF NOT coalesce(private.payment_policy_v1_is_valid(NEW.payment_policy),false) THEN RAISE EXCEPTION 'invalid_payment_policy_v1'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.payment_policy_version < OLD.payment_policy_version OR
     (NEW.payment_policy IS DISTINCT FROM OLD.payment_policy AND NEW.payment_policy_version <= OLD.payment_policy_version) THEN
   RAISE EXCEPTION 'payment_policy_version_must_increase';
  END IF;
 END IF;
 RETURN NEW;
END $fn$;

CREATE FUNCTION private.payment_snapshot_request_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE policy jsonb; version bigint;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.payment_policy_snapshot IS DISTINCT FROM OLD.payment_policy_snapshot THEN RAISE EXCEPTION 'payment_policy_snapshot_is_immutable'; END IF;
  RETURN NEW;
 END IF;
 -- This overwrite ignores client-provided policy JSON. Missing singleton is
 -- a supported legacy configuration: no policy is fabricated and RPC stays usable.
 NEW.payment_policy_snapshot := NULL;
 SELECT s.payment_policy,s.payment_policy_version INTO policy,version
 FROM public.business_finance_settings s WHERE s.id=true FOR SHARE;
 IF FOUND THEN
  IF NOT coalesce(private.payment_policy_v1_is_valid(policy),false) THEN RAISE EXCEPTION 'invalid_payment_policy_v1'; END IF;
  NEW.payment_policy_snapshot := jsonb_build_object('policy',policy,'policy_version',version);
 END IF;
 RETURN NEW;
END $fn$;

CREATE FUNCTION private.payment_snapshot_item_classification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE visit boolean;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.is_visit_service_snapshot,NEW.classification_source,NEW.classification_recorded_at,NEW.classification_recorded_by)
     IS DISTINCT FROM ROW(OLD.is_visit_service_snapshot,OLD.classification_source,OLD.classification_recorded_at,OLD.classification_recorded_by) THEN
   RAISE EXCEPTION 'item_classification_snapshot_is_immutable';
  END IF;
  IF OLD.is_visit_service_snapshot IS NOT NULL AND NEW.catalog_service_id IS DISTINCT FROM OLD.catalog_service_id THEN
   RAISE EXCEPTION 'snapshotted_catalog_service_is_immutable';
  END IF;
  RETURN NEW;
 END IF;
 NEW.is_visit_service_snapshot:=NULL; NEW.classification_source:=NULL;
 NEW.classification_recorded_at:=NULL; NEW.classification_recorded_by:=NULL;
 IF NEW.catalog_service_id IS NOT NULL THEN
  SELECT s.is_visit_service INTO visit FROM public.service_catalog_services s WHERE s.id=NEW.catalog_service_id FOR SHARE;
  IF FOUND AND visit IS NOT NULL THEN
   NEW.is_visit_service_snapshot:=visit; NEW.classification_source:='catalog_at_insert';
   NEW.classification_recorded_at:=statement_timestamp(); NEW.classification_recorded_by:=auth.uid();
  END IF;
 END IF;
 RETURN NEW;
END $fn$;

-- Remove default PUBLIC/anon/authenticated/service_role function grants locally
-- for these four new internal functions only. Existing ACLs remain untouched.
REVOKE ALL ON FUNCTION private.payment_policy_v1_is_valid(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_validate_settings_policy() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_snapshot_request_policy() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_snapshot_item_classification() FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER payment_validate_settings_policy
 BEFORE INSERT OR UPDATE OF payment_policy,payment_policy_version ON public.business_finance_settings
 FOR EACH ROW EXECUTE FUNCTION private.payment_validate_settings_policy();
CREATE TRIGGER payment_snapshot_request_policy
 BEFORE INSERT OR UPDATE OF payment_policy_snapshot ON public.service_requests
 FOR EACH ROW EXECUTE FUNCTION private.payment_snapshot_request_policy();
CREATE TRIGGER payment_snapshot_request_item_classification
 BEFORE INSERT OR UPDATE OF is_visit_service_snapshot,classification_source,classification_recorded_at,classification_recorded_by,catalog_service_id ON public.service_request_items
 FOR EACH ROW EXECUTE FUNCTION private.payment_snapshot_item_classification();
CREATE TRIGGER payment_snapshot_change_item_classification
 BEFORE INSERT OR UPDATE OF is_visit_service_snapshot,classification_source,classification_recorded_at,classification_recorded_by,catalog_service_id ON public.service_request_change_items
 FOR EACH ROW EXECUTE FUNCTION private.payment_snapshot_item_classification();
CREATE INDEX service_requests_inspection_confirmed_by_idx
ON public.service_requests (inspection_confirmed_by)
WHERE inspection_confirmed_by IS NOT NULL;
COMMIT;
