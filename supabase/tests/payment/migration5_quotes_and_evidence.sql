-- M5 synthetic rollback smoke; wsjmaojgjzxkmxywvcfy only.
BEGIN;
SET LOCAL search_path=public,extensions;
CREATE TEMP TABLE migration5_results(result jsonb);
CREATE FUNCTION pg_temp.expect_error(p_sql text,p_expected text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE denied boolean:=false;
BEGIN
 BEGIN EXECUTE p_sql;
 EXCEPTION WHEN OTHERS THEN IF p_expected IS NULL OR SQLERRM=p_expected OR SQLSTATE=p_expected THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'expected_rejection_missing: %',p_sql; END IF;
END $$;
DO $test$
DECLARE
 a uuid:='55000000-0000-4000-8000-000000000001';c uuid:='55000000-0000-4000-8000-000000000002';t uuid:='55000000-0000-4000-8000-000000000003';
 cat uuid:=gen_random_uuid();regular uuid:=gen_random_uuid();visit uuid:=gen_random_uuid();extra uuid:=gen_random_uuid();extra2 uuid:=gen_random_uuid();
 r uuid;r2 uuid;r3 uuid;tech uuid;cr uuid;foreign_cr uuid;o uuid;ci uuid;ci2 uuid;foreign_ci uuid;q uuid;q2 uuid;legacy uuid;inv uuid;ts timestamptz;rev bigint;result jsonb;
BEGIN
 INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
 SELECT u,'authenticated','authenticated','test-m5-'||u::text||'@example.invalid','{"full_name":"TEST M5"}','{}' FROM unnest(ARRAY[a,c,t]) u;
 UPDATE profiles SET role='admin_manager' WHERE id=a;UPDATE profiles SET role='technician' WHERE id=t;
 INSERT INTO technicians(profile_id,notes) VALUES(t,'TEST M5') RETURNING id INTO tech;
 INSERT INTO business_finance_settings(id,legal_name,vat_registered,tax_rate) VALUES(true,'TEST M5',false,0);
 INSERT INTO service_catalog_items(id,service_key,name) VALUES(cat,'test-m5','TEST M5');
 INSERT INTO service_catalog_services(id,service_catalog_item_id,name,net_price,tax_rate,is_visit_service)
 VALUES(regular,cat,'TEST original',100,0,false),(visit,cat,'TEST visit',50,0,true),(extra,cat,'TEST change',30,0,false),(extra2,cat,'TEST additional',20,0,false);
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 INSERT INTO service_requests(customer_id,customer_name,phone,service_type,problem_description,city,address)
 VALUES(c,'TEST M5','0500000000','TEST','TEST','مكة المكرمة','TEST') RETURNING id INTO r;
 INSERT INTO service_requests(customer_id,customer_name,phone,service_type,problem_description,city,address)
 VALUES(c,'TEST M5 foreign','0500000000','TEST','TEST','مكة المكرمة','TEST') RETURNING id INTO r2;
 INSERT INTO service_requests(customer_id,customer_name,phone,service_type,problem_description,city,address)
 VALUES(c,'TEST M5 unknown','0500000000','TEST','TEST','مكة المكرمة','TEST') RETURNING id INTO r3;
 INSERT INTO service_request_items(service_request_id,catalog_service_id,service_name,quantity,net_unit_price,tax_rate,gross_unit_price) VALUES(r,regular,'TEST original',1,100,0,100) RETURNING id INTO o;
 INSERT INTO service_request_items(service_request_id,catalog_service_id,service_name,quantity,net_unit_price,tax_rate,gross_unit_price) VALUES(r,visit,'TEST visit',1,50,0,50);
 INSERT INTO service_request_items(service_request_id,service_name,quantity,net_unit_price,tax_rate,gross_unit_price) VALUES(r3,'TEST unknown historical',1,100,0,100);
 INSERT INTO service_request_assignments(service_request_id,technician_id,assigned_by,status,responded_at) VALUES(r,tech,a,'accepted',now());
 IF NOT (SELECT work_started_at IS NULL AND inspection_confirmed_at IS NULL FROM service_requests WHERE id=r) THEN RAISE EXCEPTION 'assignment_faked_evidence'; END IF;
 UPDATE service_requests SET workflow_stage='awaiting_admin_quote' WHERE id IN (r,r2,r3);
 INSERT INTO service_request_change_requests(service_request_id,technician_id,notes) VALUES(r,tech,'TEST') RETURNING id INTO cr;
 INSERT INTO service_request_change_requests(service_request_id,technician_id,notes) VALUES(r2,tech,'TEST foreign') RETURNING id INTO foreign_cr;
 INSERT INTO service_request_change_items(change_request_id,item_type,catalog_service_id,item_name,quantity,net_unit_price,tax_rate,gross_unit_price) VALUES(cr,'service',extra,'TEST change',1,30,0,30) RETURNING id INTO ci;
 INSERT INTO service_request_change_items(change_request_id,item_type,catalog_service_id,item_name,quantity,net_unit_price,tax_rate,gross_unit_price) VALUES(cr,'service',extra2,'TEST additional',1,20,0,20) RETURNING id INTO ci2;
 INSERT INTO service_request_change_items(change_request_id,item_type,catalog_service_id,item_name,quantity,net_unit_price,tax_rate,gross_unit_price) VALUES(foreign_cr,'service',extra,'TEST foreign',1,30,0,30) RETURNING id INTO foreign_ci;
 PERFORM pg_temp.expect_error(format('SELECT public.admin_submit_full_final_work_quote(%L,''TEST'',ARRAY[%L,%L]::uuid[])',r,ci,ci),'duplicate_or_invalid_source');
 PERFORM pg_temp.expect_error(format('SELECT public.admin_submit_full_final_work_quote(%L,''TEST'',ARRAY[%L,%L]::uuid[])',r,o,o),'duplicate_or_invalid_source');
 PERFORM pg_temp.expect_error(format('SELECT public.admin_submit_full_final_work_quote(%L,''TEST'',ARRAY[%L]::uuid[])',r,foreign_ci),'invalid_or_foreign_change_source');
 PERFORM pg_temp.expect_error(format('SELECT public.admin_submit_full_final_work_quote(%L,''TEST'')',r3),'historical_service_classification_unavailable');
 -- Mutate live catalog AFTER snapshots; classification/value must remain historical.
 UPDATE service_catalog_services SET is_visit_service=true,net_price=999 WHERE id IN (regular,extra,extra2);
 UPDATE service_catalog_services SET is_visit_service=false,net_price=999 WHERE id=visit;
 EXECUTE 'SET LOCAL ROLE authenticated';q:=admin_submit_full_final_work_quote(r,'TEST final work',ARRAY[ci,ci2]);EXECUTE 'RESET ROLE';
 IF NOT (SELECT quote_basis='full_final_work' AND financial_revision=1 AND parts_cost+labor_cost=150 FROM service_request_quotes WHERE id=q) OR NOT (SELECT payment_revision=1 FROM service_requests WHERE id=r) THEN RAISE EXCEPTION 'full_work_total_or_revision_invalid'; END IF;
 IF NOT (SELECT count(*)=4 AND count(*) FILTER(WHERE x->>'source_id'=o::text)=1 AND sum((x->>'gross_total')::numeric) FILTER(WHERE x->'excluded_from_final'='false'::jsonb)=150 AND count(*) FILTER(WHERE x->'is_visit_service_snapshot'='true'::jsonb AND x->'excluded_from_final'='true'::jsonb)=1 FROM service_request_quotes q0 CROSS JOIN LATERAL jsonb_array_elements(q0.line_items) x WHERE q0.id=q) THEN RAISE EXCEPTION 'provenance_or_double_count_invalid'; END IF;
 PERFORM pg_temp.expect_error(format('UPDATE public.service_requests SET workflow_stage=''awaiting_admin_quote'' WHERE id=%L; INSERT INTO public.service_request_quotes(service_request_id,description,parts_cost,labor_cost,line_items,created_by,quote_basis,financial_revision) SELECT service_request_id,''TEST forged'',parts_cost,labor_cost,line_items,created_by,quote_basis,999 FROM public.service_request_quotes WHERE id=%L',r,q),'financial_quote_revision_tampering');
 PERFORM set_config('request.jwt.claim.sub',c::text,true);EXECUTE 'SET LOCAL ROLE authenticated';PERFORM customer_decide_service_request_quote(q,true);EXECUTE 'RESET ROLE';
 PERFORM pg_temp.expect_error(format('UPDATE public.service_request_quotes SET parts_cost=50 WHERE id=%L',q),'full_work_quote_is_immutable');
 PERFORM pg_temp.expect_error(format('UPDATE public.service_request_quotes SET quote_basis=''legacy_as_approved'',financial_revision=NULL WHERE id=%L',q),'quote_financial_metadata_is_immutable');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);PERFORM admin_advance_service_request(r,'in_progress');
 IF NOT (SELECT work_started_at IS NULL AND inspection_confirmed_at IS NULL FROM service_requests WHERE id=r) THEN RAISE EXCEPTION 'stage_faked_evidence'; END IF;
 PERFORM set_config('request.jwt.claim.sub',t::text,true);EXECUTE 'SET LOCAL ROLE authenticated';PERFORM technician_confirm_work_started(r);EXECUTE 'RESET ROLE';
 SELECT work_started_at,payment_revision INTO ts,rev FROM service_requests WHERE id=r;
 PERFORM technician_confirm_work_started(r);
 IF NOT (SELECT work_started_at=ts AND work_started_basis='technician_explicit_start' AND payment_revision=rev FROM service_requests WHERE id=r) THEN RAISE EXCEPTION 'work_start_retry_changed_history'; END IF;
 PERFORM pg_temp.expect_error(format('UPDATE public.service_requests SET work_started_at=work_started_at+interval ''1 second'' WHERE id=%L',r),'work_start_evidence_is_immutable');
 PERFORM pg_temp.expect_error(format('SELECT public.technician_confirm_work_started(%L)',r2),'accepted_assignment_not_found');
 PERFORM pg_temp.expect_error(format('UPDATE public.service_catalog_services SET is_visit_service=true WHERE id=%L; INSERT INTO public.service_request_items(service_request_id,catalog_service_id,service_name,quantity,net_unit_price,tax_rate,gross_unit_price) VALUES(%L,%L,''TEST second visit'',1,50,0,50); SELECT public.technician_confirm_inspection_earned(%L)',visit,r,visit,r),'ambiguous_multiple_visit_obligations');
 EXECUTE 'SET LOCAL ROLE authenticated';PERFORM technician_confirm_inspection_earned(r);EXECUTE 'RESET ROLE';
 SELECT inspection_confirmed_at,payment_revision INTO ts,rev FROM service_requests WHERE id=r;
 IF NOT (SELECT inspection_confirmed_by=t AND inspection_earned_amount=50 AND payment_revision=2 FROM service_requests WHERE id=r) THEN RAISE EXCEPTION 'inspection_historical_amount_invalid'; END IF;
 PERFORM technician_confirm_inspection_earned(r);
 IF NOT (SELECT inspection_confirmed_at=ts AND payment_revision=rev FROM service_requests WHERE id=r) THEN RAISE EXCEPTION 'inspection_retry_changed_history'; END IF;
 PERFORM pg_temp.expect_error(format('UPDATE public.service_requests SET inspection_earned_amount=999 WHERE id=%L',r),'inspection_evidence_is_immutable');
 PERFORM pg_temp.expect_error(format('SELECT public.technician_confirm_inspection_earned(%L)',r2),'accepted_assignment_not_found');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 INSERT INTO service_request_assignments(service_request_id,technician_id,assigned_by,status,responded_at) VALUES(r2,tech,a,'accepted',now());
 PERFORM set_config('request.jwt.claim.sub',t::text,true);
 PERFORM pg_temp.expect_error(format('SELECT public.technician_confirm_inspection_earned(%L)',r2),'historical_visit_obligation_unavailable');
 -- Simulate a valid subsequent quote-ready precondition; the financial RPC still performs all locks/ownership checks.
 PERFORM set_config('request.jwt.claim.sub',a::text,true);UPDATE service_requests SET workflow_stage='awaiting_admin_quote' WHERE id=r;
 q2:=admin_submit_full_final_work_quote(r,'TEST revision 2',ARRAY[ci,ci2]);
 IF NOT (SELECT financial_revision=3 FROM service_request_quotes WHERE id=q2) OR NOT (SELECT payment_revision=3 FROM service_requests WHERE id=r) THEN RAISE EXCEPTION 'quote_revision_not_monotonic'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c::text,true);PERFORM customer_decide_service_request_quote(q2,false);
 IF NOT (SELECT status='rejected' FROM service_request_quotes WHERE id=q2) THEN RAISE EXCEPTION 'rejected_quote_approved'; END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);UPDATE service_requests SET workflow_stage='completed' WHERE id=r;inv:=finance_ensure_invoice_draft(r);
 IF NOT (SELECT total=150 FROM invoices WHERE id=inv) OR (SELECT count(*) FROM invoice_line_items WHERE invoice_id=inv)<>3 THEN RAISE EXCEPTION 'full_quote_invoice_seed_invalid'; END IF;
 -- Legacy overload still creates its original totals and no revision evidence.
 legacy:=admin_submit_service_request_quote(r2,'TEST legacy','TEST legacy parts',30,20);
 IF NOT (SELECT quote_basis='legacy_as_approved' AND financial_revision IS NULL AND parts_cost+labor_cost=50 AND line_items='[]'::jsonb FROM service_request_quotes WHERE id=legacy) OR NOT (SELECT payment_revision=0 AND inspection_confirmed_at IS NULL AND work_started_at IS NULL FROM service_requests WHERE id=r2) THEN RAISE EXCEPTION 'legacy_history_changed'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c::text,true);PERFORM customer_decide_service_request_quote(legacy,true);
 PERFORM set_config('request.jwt.claim.sub',a::text,true);UPDATE service_requests SET workflow_stage='completed' WHERE id=r2;inv:=finance_ensure_invoice_draft(r2);
 IF NOT (SELECT total=50 FROM invoices WHERE id=inv) THEN RAISE EXCEPTION 'legacy_invoice_total_changed'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM pg_temp.expect_error(format('SELECT public.technician_confirm_inspection_earned(%L)',r),'42501');
 PERFORM pg_temp.expect_error(format('SELECT public.technician_confirm_work_started(%L)',r),'42501');
 PERFORM pg_temp.expect_error(format('SELECT public.admin_submit_full_final_work_quote(%L,''TEST'')',r),'42501');EXECUTE 'RESET ROLE';
 IF (SELECT payment_domain_enabled OR gateway_enabled FROM business_finance_settings) THEN RAISE EXCEPTION 'feature_gate_enabled'; END IF;
 result:=jsonb_build_object('LEGACY_QUOTE_PATH_UNCHANGED','PASS','FULL_FINAL_WORK_RPC','PASS','SERVER_SIDE_COMPOSITION','PASS','ORIGINAL_REGULAR_INCLUDED_ONCE','PASS','VISIT_EXCLUDED_FROM_FINAL_WHEN_INCLUDED','PASS','SOURCE_PROVENANCE','PASS','DUPLICATE_SOURCE_REJECTED','PASS','UNKNOWN_CLASSIFICATION_REJECTED','PASS','PAYMENT_REVISION_MONOTONIC','PASS','QUOTE_FINANCIAL_REVISION','PASS','FULL_FINAL_WORK_INVOICE_SEEDING','PASS','LEGACY_INVOICE_PATH_UNCHANGED','PASS','INSPECTION_EXPLICIT_EVENT','PASS','INSPECTION_AMOUNT_HISTORICAL','PASS','INSPECTION_FIRST_WRITE_WINS','PASS','WORK_START_EXPLICIT_EVENT','PASS','WORK_START_FIRST_WRITE_WINS','PASS','STAGE_DOES_NOT_FAKE_WORK_START','PASS','ROLE_NEGATIVE','PASS','CATALOG_MUTATION','PASS');
 INSERT INTO migration5_results VALUES(result);
END $test$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT result FROM migration5_results;
ROLLBACK;
