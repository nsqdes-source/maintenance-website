BEGIN;
SET LOCAL search_path=public,extensions;
CREATE FUNCTION pg_temp.submit(cat uuid,svc uuid,choice text DEFAULT NULL,ver bigint DEFAULT NULL)
RETURNS TABLE(request_id uuid,request_upload_token uuid) LANGUAGE sql AS $$
 SELECT * FROM public.submit_service_request_with_payment_choice_v1(
 'TEST PHASE4','0500000000','phase4@example.invalid',cat,jsonb_build_array(jsonb_build_object('id',svc,'quantity',2)),
 'TEST','TEST','مكة المكرمة','TEST ADDRESS',21.4,39.8,current_date+1,'morning',
 p_payment_choice_timing=>choice,p_expected_payment_policy_version=>ver);
$$;
CREATE FUNCTION pg_temp.expect_error(q text,wanted text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text; BEGIN BEGIN EXECUTE q;EXCEPTION WHEN OTHERS THEN got:=SQLERRM;END;
 IF got IS NULL OR (got<>wanted AND NOT (wanted='42501' AND got LIKE 'permission denied%')) THEN RAISE EXCEPTION 'expected %, got %',wanted,got;END IF;
END $$;
DO $$
DECLARE cat uuid:=gen_random_uuid(); svc uuid:=gen_random_uuid(); r uuid; legacy uuid; direct uuid; tok uuid;
 u uuid; payload jsonb; base jsonb; policy jsonb; snap jsonb; st jsonb; before_count int; before_events int;
 timing text; choice text; expected bigint; mode text; path text; ver bigint:=1;
BEGIN
 IF EXISTS(SELECT 1 FROM business_finance_settings) THEN RAISE EXCEPTION 'requires_empty_test_settings';END IF;
 INSERT INTO storage.buckets(id,name,public) VALUES('request-images','request-images',false) ON CONFLICT(id) DO NOTHING;
 INSERT INTO service_catalog_items(id,service_key,name) VALUES(cat,'test-phase4','TEST PHASE4');
 INSERT INTO service_catalog_services(id,service_catalog_item_id,name,net_price,tax_rate,is_visit_service) VALUES(svc,cat,'TEST VISIT',50,15,true);
 INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
 SELECT ('74000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated','phase4-'||i||'@example.invalid','{"full_name":"TEST PHASE4"}','{}' FROM generate_series(1,5)i;
 UPDATE profiles SET role='technician' WHERE id='74000000-0000-4000-8000-000000000002';
 UPDATE profiles SET role='maintenance_manager' WHERE id='74000000-0000-4000-8000-000000000003';
 UPDATE profiles SET role='admin_manager' WHERE id='74000000-0000-4000-8000-000000000004';
 UPDATE profiles SET role='super_admin' WHERE id='74000000-0000-4000-8000-000000000005';
 FOR i IN 0..5 LOOP
 u:=CASE WHEN i=0 THEN NULL ELSE ('74000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid END;
 PERFORM set_config('request.jwt.claim.sub',coalesce(u::text,''),true);
 IF i=0 THEN SET LOCAL ROLE anon; ELSE SET LOCAL ROLE authenticated; END IF;
 payload:=public.get_request_payment_policy();
 IF payload<>'{"configured":false,"payment_domain_enabled":false,"payment_policy_version":null,"payment_policy":null}'::jsonb THEN RAISE EXCEPTION 'unsafe_empty_policy_read';END IF;
 SELECT * INTO r,tok FROM pg_temp.submit(cat,svc);
 PERFORM pg_temp.expect_error(format('UPDATE public.service_requests SET payment_choice_timing=''prepay'' WHERE id=%L',r),'42501');
 PERFORM pg_temp.expect_error('SELECT private.payment_policy_v1_is_valid(''{}'')','42501');
 IF has_table_privilege(current_user,'public.business_finance_settings','MAINTAIN') OR has_table_privilege(current_user,'public.service_requests','MAINTAIN') THEN RAISE EXCEPTION 'maintain_exposed';END IF;
 RESET ROLE;
 IF NOT (SELECT customer_id IS NOT DISTINCT FROM u AND upload_token=tok AND payment_choice_timing IS NULL AND payment_policy_snapshot IS NULL AND payment_revision=0 AND workflow_stage='awaiting_assignment' FROM service_requests WHERE id=r) THEN RAISE EXCEPTION 'disabled_request_changed';END IF;
 IF NOT (SELECT count(*)=1 AND bool_and(x.is_visit_service_snapshot) AND bool_and(x.net_unit_price=c.net_price AND x.tax_rate=c.tax_rate AND x.gross_unit_price=c.gross_price AND x.gross_total=2*c.gross_price AND x.quantity=2) FROM service_request_items x JOIN service_catalog_services c ON c.id=x.catalog_service_id WHERE x.service_request_id=r) THEN RAISE EXCEPTION 'pricing_or_visit_duplicate';END IF;
 path:=r::text||'/'||tok::text||'/test.png';
 INSERT INTO storage.objects(bucket_id,name) VALUES('request-images',path);
 IF i=0 THEN SET LOCAL ROLE anon; ELSE SET LOCAL ROLE authenticated; END IF;
 PERFORM public.attach_service_request_image(r,tok,path,'image/png');
 PERFORM pg_temp.expect_error(format('SELECT public.attach_service_request_image(%L,%L,%L,''image/png'')',r,gen_random_uuid(),path),'request_not_found');
 RESET ROLE;
 IF NOT EXISTS(SELECT 1 FROM service_request_attachments WHERE service_request_id=r AND storage_path=path AND uploaded_by IS NOT DISTINCT FROM u) THEN RAISE EXCEPTION 'upload_token_flow_changed';END IF;
 IF i=0 THEN legacy:=r; END IF;
 END LOOP;

END $$;
SELECT 'PASS' result;
ROLLBACK;
