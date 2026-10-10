BEGIN;
SET LOCAL search_path=public,extensions;
CREATE FUNCTION pg_temp.denied(q text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE blocked boolean:=false;BEGIN BEGIN EXECUTE q;EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'expected_permission_denial: %',q;END IF;END $$;
DO $$
DECLARE uid uuid;r uuid;legacy uuid;t uuid;t2 uuid;c jsonb;before_state jsonb;i integer;
BEGIN
 INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data) SELECT ('75000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','phase5-'||n||'@example.invalid','{"full_name":"TEST PHASE5"}','{}' FROM generate_series(1,7)n;
 UPDATE profiles SET role='technician' WHERE id IN ('75000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000006','75000000-0000-4000-8000-000000000007');
 UPDATE profiles SET role='maintenance_manager' WHERE id='75000000-0000-4000-8000-000000000003';
 UPDATE profiles SET role='admin_manager' WHERE id='75000000-0000-4000-8000-000000000004';
 UPDATE profiles SET role='super_admin' WHERE id='75000000-0000-4000-8000-000000000005';
 INSERT INTO technicians(profile_id,is_active) VALUES('75000000-0000-4000-8000-000000000002',true) RETURNING id INTO t;
 INSERT INTO technicians(profile_id,is_active) VALUES('75000000-0000-4000-8000-000000000006',true) RETURNING id INTO t2;
 INSERT INTO technicians(profile_id,is_active) VALUES('75000000-0000-4000-8000-000000000007',false);
 INSERT INTO service_requests(customer_id,customer_name,phone,service_type,problem_description,city,address) VALUES('75000000-0000-4000-8000-000000000001','TEST legacy','0500000000','TEST','TEST','TEST','TEST') RETURNING id INTO legacy;
 INSERT INTO business_finance_settings(id,legal_name,vat_registered,tax_rate,currency) VALUES(true,'TEST PHASE5',false,0,'SAR');
 INSERT INTO service_requests(customer_id,customer_name,phone,service_type,problem_description,city,address) VALUES('75000000-0000-4000-8000-000000000001','TEST','0500000000','TEST','TEST','TEST','TEST') RETURNING id INTO r;
 INSERT INTO service_request_assignments(service_request_id,technician_id,assigned_by,status,responded_at) SELECT x,t,'75000000-0000-4000-8000-000000000004','accepted',now() FROM unnest(ARRAY[r,legacy]) x;
 before_state:=private.payment_financial_state(r);
 FOR i IN 0..7 LOOP
 uid:=CASE WHEN i=0 THEN NULL ELSE ('75000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid END;
 PERFORM set_config('request.jwt.claim.sub',coalesce(uid::text,''),true);
 IF i=0 THEN SET LOCAL ROLE anon;ELSE SET LOCAL ROLE authenticated;END IF;
 IF i=2 THEN
 c:=public.technician_get_collection_context(r);
 IF (c->>'collection_allowed')::boolean OR (c->>'payment_domain_enabled')::boolean OR c->>'collection_block_reason'<>'payment_domain_not_enabled' OR c->'collections'<>'[]'::jsonb THEN RAISE EXCEPTION 'dark_launch_bad';END IF;
 c:=public.technician_get_collection_context(legacy);IF (c->>'collection_allowed')::boolean THEN RAISE EXCEPTION 'legacy_collection_allowed';END IF;
 IF c ? 'note' OR c ? 'audit' OR c ? 'gross_receipts' THEN RAISE EXCEPTION 'excessive_disclosure';END IF;
 ELSE PERFORM pg_temp.denied(format('SELECT public.technician_get_collection_context(%L)',r));END IF;
 IF i IN (4,5) THEN c:=public.finance_get_payment_operations();IF (c->>'payment_domain_enabled')::boolean OR c->'operations'<>'[]'::jsonb THEN RAISE EXCEPTION 'finance_dark_launch_bad';END IF;
 ELSE PERFORM pg_temp.denied('SELECT public.finance_get_payment_operations()');END IF;
 IF has_table_privilege(current_user,'public.technician_collections','SELECT') OR has_table_privilege(current_user,'public.technician_collections','INSERT') OR has_function_privilege(current_user,'private.payment_financial_state(uuid)','EXECUTE') THEN RAISE EXCEPTION 'm7_boundary_broken';END IF;
 RESET ROLE;
 END LOOP;
 IF private.payment_financial_state(r) IS DISTINCT FROM before_state THEN RAISE EXCEPTION 'read_changed_financial_state';END IF;
 IF EXISTS(SELECT 1 FROM technician_collections) OR EXISTS(SELECT 1 FROM service_request_payments) OR EXISTS(SELECT 1 FROM invoice_payments) THEN RAISE EXCEPTION 'read_created_money';END IF;
 IF EXISTS(SELECT 1 FROM business_finance_settings WHERE payment_domain_enabled OR gateway_enabled) THEN RAISE EXCEPTION 'flags_changed';END IF;
END $$;
SELECT 'PHASE5_RESTRICTED_READ_ROLE_DARK_LAUNCH_PASS' AS result;
ROLLBACK;
