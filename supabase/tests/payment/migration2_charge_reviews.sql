-- Test only: wsjmaojgjzxkmxywvcfy. No fixture persists.
BEGIN;
SET LOCAL search_path=public,extensions;
CREATE TEMP TABLE migration2_results(result jsonb);
DO $test$
DECLARE
 a uuid:='33000000-0000-4000-8000-000000000001'; c uuid:='33000000-0000-4000-8000-000000000002';
 t uuid:='33000000-0000-4000-8000-000000000003'; m uuid:='33000000-0000-4000-8000-000000000004'; s uuid:='33000000-0000-4000-8000-000000000005';
 r uuid; r2 uuid; r3 uuid; inv uuid; inv2 uuid; x uuid; y uuid; z uuid; rejected uuid; pending uuid; rival uuid;
 uid uuid; field text; bad numeric; denied boolean; before_audit bigint; results jsonb:='{}';
BEGIN
 INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
 SELECT u,'authenticated','authenticated','test-m2-'||u::text||'@example.invalid','{"full_name":"TEST M2 SYNTHETIC"}','{}' FROM unnest(ARRAY[a,c,t,m,s]) u;
 UPDATE profiles SET role='admin_manager' WHERE id=a; UPDATE profiles SET role='technician' WHERE id=t;
 UPDATE profiles SET role='maintenance_manager' WHERE id=m; UPDATE profiles SET role='super_admin' WHERE id=s;
 INSERT INTO service_requests(customer_name,phone,service_type,problem_description,city,address)
 VALUES('TEST M2 A','0500000000','TEST','TEST','مكة المكرمة','TEST') RETURNING id INTO r;
 INSERT INTO service_requests(customer_name,phone,service_type,problem_description,city,address)
 VALUES('TEST M2 B','0500000000','TEST','TEST','مكة المكرمة','TEST') RETURNING id INTO r2;
 INSERT INTO service_requests(customer_name,phone,service_type,problem_description,city,address)
 VALUES('TEST M2 C','0500000000','TEST','TEST','مكة المكرمة','TEST') RETURNING id INTO r3;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 denied:=false; BEGIN PERFORM finance_propose_charge_review(r,50,'TEST missing currency');
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='charge_review_currency_unavailable' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'currency_source_invented'; END IF;
 INSERT INTO business_finance_settings(id,legal_name,vat_registered,tax_rate,currency) VALUES(true,'TEST M2 BUSINESS',false,0,'SAR');
 EXECUTE 'SET LOCAL ROLE authenticated'; x:=finance_propose_charge_review(r,50,'TEST initial','TEST note'); EXECUTE 'RESET ROLE';
 IF NOT (SELECT status='proposed' AND final_charge=50 AND currency='SAR' AND created_by=a AND invoice_id IS NULL FROM finance_charge_reviews WHERE id=x)
 OR NOT EXISTS(SELECT 1 FROM private.payment_audit_events WHERE entity_id=x AND event_type='finance_charge_review_proposed' AND actor_id=a AND actor_role='admin_manager' AND details->>'currency'='SAR') THEN RAISE EXCEPTION 'propose_failed'; END IF;
 results:=results||jsonb_build_object('PROPOSE_REVIEW','PASS','MISSING_CURRENCY_REJECTED','PASS');
 FOREACH uid IN ARRAY ARRAY[c,t,m] LOOP
  PERFORM set_config('request.jwt.claim.sub',uid::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
  denied:=false; BEGIN PERFORM finance_propose_charge_review(r,1,'TEST denied'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'unauthorized_propose'; END IF;
  denied:=false; BEGIN PERFORM finance_decide_charge_review(x,true); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'unauthorized_decide'; END IF;
  denied:=false; BEGIN INSERT INTO finance_charge_reviews(service_request_id,final_charge,currency,reason,created_by) VALUES(r,1,'SAR','TEST denied',uid); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'direct_insert_exposed'; END IF; EXECUTE 'RESET ROLE';
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub','',true); EXECUTE 'SET LOCAL ROLE anon';
 denied:=false; BEGIN PERFORM finance_propose_charge_review(r,1,'TEST anon'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'anon_propose'; END IF;
 denied:=false; BEGIN PERFORM finance_decide_charge_review(x,true); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'anon_decide'; END IF; EXECUTE 'RESET ROLE';
 results:=results||jsonb_build_object('ROLE_NEGATIVE_TESTS','PASS');
 PERFORM set_config('request.jwt.claim.sub',a::text,true); EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM finance_decide_charge_review(x,true,'TEST approved'); EXECUTE 'RESET ROLE';
 IF NOT (SELECT status='approved' AND decided_by=a AND decided_at IS NOT NULL FROM finance_charge_reviews WHERE id=x)
 OR NOT EXISTS(SELECT 1 FROM private.payment_audit_events WHERE entity_id=x AND event_type='finance_charge_review_approved') THEN RAISE EXCEPTION 'approve_failed'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated'; rejected:=finance_propose_charge_review(r2,10,'TEST reject'); PERFORM finance_decide_charge_review(rejected,false,'TEST rejected'); pending:=finance_propose_charge_review(r2,20,'TEST pending'); EXECUTE 'RESET ROLE';
 IF NOT (SELECT status='rejected' AND decided_by=a AND decided_at IS NOT NULL FROM finance_charge_reviews WHERE id=rejected)
 OR NOT EXISTS(SELECT 1 FROM private.payment_audit_events WHERE entity_id=rejected AND event_type='finance_charge_review_rejected') THEN RAISE EXCEPTION 'reject_failed'; END IF;
 results:=results||jsonb_build_object('APPROVE_REVIEW','PASS','REJECT_REVIEW','PASS');
 -- Test core immutability with owner SQL too; application roles have no table writes.
 FOREACH field IN ARRAY ARRAY['final_charge=99','reason=''TEST altered''','invoice_id=gen_random_uuid()','service_request_id=gen_random_uuid()','supersedes_review_id=gen_random_uuid()','status=''proposed''','decision_note=''TEST altered'''] LOOP
 denied:=false; BEGIN EXECUTE 'UPDATE public.finance_charge_reviews SET '||field||' WHERE id=$1' USING x;
 EXCEPTION WHEN OTHERS THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'approved_mutable: %',field; END IF; END LOOP;
 denied:=false; BEGIN UPDATE finance_charge_reviews SET final_charge=21 WHERE id=pending;
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='charge_review_fields_are_immutable' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'proposed_core_mutable'; END IF;
 denied:=false; BEGIN UPDATE finance_charge_reviews SET status='approved',decided_by=a,decided_at=now() WHERE id=rejected;
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='charge_review_is_immutable' THEN denied:=true; ELSE RAISE; END IF; END; IF NOT denied THEN RAISE EXCEPTION 'rejected_mutable'; END IF;
 denied:=false; BEGIN DELETE FROM finance_charge_reviews WHERE id=x; EXCEPTION WHEN OTHERS THEN IF SQLERRM='charge_review_delete_forbidden' THEN denied:=true; ELSE RAISE; END IF; END; IF NOT denied THEN RAISE EXCEPTION 'review_delete'; END IF;
 FOREACH field IN ARRAY ARRAY['UPDATE private.payment_audit_events SET details=''{}''','DELETE FROM private.payment_audit_events','TRUNCATE private.payment_audit_events'] LOOP
 denied:=false; BEGIN EXECUTE field; EXCEPTION WHEN OTHERS THEN IF SQLERRM='payment_audit_is_append_only' THEN denied:=true; ELSE RAISE; END IF; END; IF NOT denied THEN RAISE EXCEPTION 'audit_mutable'; END IF; END LOOP;
 results:=results||jsonb_build_object('REVIEW_IMMUTABILITY','PASS','AUDIT_IMMUTABILITY','PASS');
 -- Independent approval is blocked in the DB even when bypassing the public RPC.
 EXECUTE 'SET LOCAL ROLE authenticated'; rival:=finance_propose_charge_review(r,60,'TEST independent'); EXECUTE 'RESET ROLE';
 SELECT count(*) INTO before_audit FROM private.payment_audit_events;
 denied:=false; BEGIN UPDATE finance_charge_reviews SET status='approved',decided_by=a,decided_at=now() WHERE id=rival;
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='existing_approved_charge_review_requires_supersedes' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied OR (SELECT count(*) FROM private.payment_audit_events)<>before_audit THEN RAISE EXCEPTION 'independent_approval_or_audit_not_atomic'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated'; y:=finance_propose_charge_review(r,200,'TEST A', '',x); PERFORM finance_decide_charge_review(y,true);
 z:=finance_propose_charge_review(r,50,'TEST B','',y); rival:=finance_propose_charge_review(r,40,'TEST stale successor','',y); PERFORM finance_decide_charge_review(z,true); EXECUTE 'RESET ROLE';
 IF NOT (SELECT status='approved' AND final_charge=200 FROM finance_charge_reviews WHERE id=y) OR NOT (SELECT status='approved' AND final_charge=50 FROM finance_charge_reviews WHERE id=z)
 OR (SELECT count(*) FROM finance_charge_reviews q WHERE q.service_request_id=r AND status='approved' AND NOT EXISTS(SELECT 1 FROM finance_charge_reviews k WHERE k.supersedes_review_id=q.id AND k.status='approved'))<>1
 OR NOT EXISTS(SELECT 1 FROM finance_charge_reviews q WHERE q.id=z AND NOT EXISTS(SELECT 1 FROM finance_charge_reviews k WHERE k.supersedes_review_id=q.id AND k.status='approved')) THEN RAISE EXCEPTION 'supersession_failed'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated'; denied:=false; BEGIN PERFORM finance_decide_charge_review(rival,true); EXCEPTION WHEN OTHERS THEN IF SQLERRM='superseded_review_not_current' THEN denied:=true; ELSE RAISE; END IF; END; EXECUTE 'RESET ROLE'; IF NOT denied THEN RAISE EXCEPTION 'second_successor_allowed'; END IF;
 FOREACH uid IN ARRAY ARRAY[rejected,pending,y] LOOP
 denied:=false; BEGIN PERFORM finance_propose_charge_review(r,5,'TEST invalid supersedes','',uid); EXCEPTION WHEN OTHERS THEN IF SQLERRM IN ('invalid_supersedes_review','superseded_review_not_current') THEN denied:=true; ELSE RAISE; END IF; END; IF NOT denied THEN RAISE EXCEPTION 'bad_supersedes_accepted'; END IF; END LOOP;
 denied:=false; BEGIN PERFORM finance_propose_charge_review(r2,5,'TEST wrong request','',z); EXCEPTION WHEN OTHERS THEN IF SQLERRM='invalid_supersedes_review' THEN denied:=true; ELSE RAISE; END IF; END; IF NOT denied THEN RAISE EXCEPTION 'cross_request_supersession'; END IF;
 IF (SELECT count(*) FROM pg_index WHERE indexrelid IN ('public.finance_charge_reviews_approved_root_uidx'::regclass,'public.finance_charge_reviews_approved_successor_uidx'::regclass) AND indisunique AND indisvalid)<>2 THEN RAISE EXCEPTION 'chain_unique_guards_missing'; END IF;
 -- Database assertion verifies the shared lock precedes review-row locks.
 IF position('FROM public.service_requests' IN pg_get_functiondef('public.finance_decide_charge_review(uuid,boolean,text)'::regprocedure)) > position('ORDER BY id FOR UPDATE' IN pg_get_functiondef('public.finance_decide_charge_review(uuid,boolean,text)'::regprocedure)) THEN RAISE EXCEPTION 'request_first_lock_order_invalid'; END IF;
 results:=results||jsonb_build_object('SUPERSESSION','PASS','INVALID_SUPERSESSION','PASS','MULTIPLE_CURRENT_APPROVED_PREVENTED','PASS','DATABASE_CONCURRENCY_ASSERTIONS','PASS');
 PERFORM set_config('request.jwt.claim.sub',s::text,true); EXECUTE 'SET LOCAL ROLE authenticated'; x:=finance_propose_charge_review(r3,0,'TEST zero'); PERFORM finance_decide_charge_review(x,true); EXECUTE 'RESET ROLE';
 IF NOT (SELECT final_charge=0 AND status='approved' AND created_by=s FROM finance_charge_reviews WHERE id=x) THEN RAISE EXCEPTION 'zero_failed'; END IF;
 FOREACH bad IN ARRAY ARRAY[-1::numeric,'NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric,0.001::numeric,10000000000::numeric] LOOP
 denied:=false; BEGIN PERFORM finance_propose_charge_review(r3,bad,'TEST bad amount'); EXCEPTION WHEN OTHERS THEN IF SQLERRM='invalid_final_charge' THEN denied:=true; ELSE RAISE; END IF; END; IF NOT denied THEN RAISE EXCEPTION 'bad_amount_allowed'; END IF; END LOOP;
 results:=results||jsonb_build_object('ZERO_CHARGE_SUPPORTED','PASS','SUPER_ADMIN_ALLOWED','PASS','INVALID_AMOUNT_REJECTED','PASS');
 -- Invoice currency wins over settings; no invoice/ledger mutation by reviews.
 INSERT INTO invoices(service_request_id,customer_name,customer_email,business_name,business_address,business_email,business_tax_number,vat_registered,description,subtotal,tax_rate,tax_amount,total,currency,created_by)
 VALUES(r,'TEST','test-m2@example.invalid','TEST','','','',false,'TEST',200,0,0,200,'SAR',a) RETURNING id INTO inv;
 INSERT INTO invoices(service_request_id,customer_name,customer_email,business_name,business_address,business_email,business_tax_number,vat_registered,description,subtotal,tax_rate,tax_amount,total,currency,created_by)
 VALUES(r2,'TEST','test-m2@example.invalid','TEST','','','',false,'TEST',30,0,0,30,'SAR',a) RETURNING id INTO inv2;
 DELETE FROM business_finance_settings WHERE id=true;
 PERFORM set_config('request.jwt.claim.sub',a::text,true); EXECUTE 'SET LOCAL ROLE authenticated'; x:=finance_propose_charge_review(r,30,'TEST C','',z); PERFORM finance_decide_charge_review(x,true); EXECUTE 'RESET ROLE';
 IF NOT (SELECT invoice_id=inv AND currency='SAR' AND final_charge=30 FROM finance_charge_reviews WHERE id=x) OR NOT (SELECT total=200 AND status='draft' FROM invoices WHERE id=inv) THEN RAISE EXCEPTION 'invoice_currency_or_total_changed'; END IF;
 denied:=false; BEGIN INSERT INTO finance_charge_reviews(service_request_id,invoice_id,final_charge,currency,reason,created_by) VALUES(r,inv2,1,'SAR','TEST wrong invoice',a);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='invoice_request_mismatch' THEN denied:=true; ELSE RAISE; END IF; END; IF NOT denied THEN RAISE EXCEPTION 'wrong_invoice_allowed'; END IF;
 results:=results||jsonb_build_object('WRONG_INVOICE_RELATION_REJECTED','PASS','SERVER_RESOLVED_INVOICE_CURRENCY','PASS','APPROVED_30_REPRESENTABLE','PASS','LEDGER_UNCHANGED','PASS');
 IF EXISTS(SELECT 1 FROM business_finance_settings WHERE payment_domain_enabled OR gateway_enabled) THEN RAISE EXCEPTION 'domain_scope_exceeded'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN ('payment_write_audit_event','payment_audit_forbid_mutation','finance_guard_charge_review','finance_audit_charge_review') AND (has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('service_role',p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'private_helpers_exposed'; END IF;
 INSERT INTO migration2_results VALUES(results||jsonb_build_object('FEATURE_GATES','PASS','M2_DOMAIN_SCOPE_EXPECTATION','UPDATED_FOR_LATER_APPROVED_MIGRATIONS','PRIVATE_HELPERS_NOT_EXPOSED','PASS'));
END $test$;
SELECT result FROM migration2_results;
ROLLBACK;
