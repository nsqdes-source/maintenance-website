import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { RpcPreparationAdapter, normalizeSourceEnvelope, sourceFingerprint, mapPersistenceFailure, PersistenceError } from '../../lib/zatca/persistence.ts';

// Only an in-memory local PostgreSQL engine. No network, Supabase credentials or fixture files.
let db,adapter;
const admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const invoice='11111111-1111-4111-8111-111111111111';
const request='22222222-2222-4222-8222-222222222222';
const at='2026-10-01T00:00:00.000Z';
const input=()=>({buyer:{buyerType:'consumer',vatRegistrationStatus:'not_registered',name:null,vatNumber:null,otherIdentifier:null,address:null,identityConfirmed:true,transactionCountry:'SA'},supplyDate:null,documentKind:'invoice',flags:{}});
const session=(role='super_admin',id=admin)=>({auth:{getUser:async()=>({data:{user:id?{id}:null},error:null})},from:table=>{assert.equal(table,'profiles');return {select:columns=>{assert.equal(columns,'role');return {eq:(key,value)=>{assert.equal(key,'id');assert.equal(value,id);return {single:async()=>({data:{role},error:null})};}};}};}});
const rpcClient={rpc:async(name,args)=>{
 try {
  let sql,values;
  if(name==='zatca_read_preparation_context') {sql='select public.zatca_read_preparation_context($1::uuid,$2::uuid,$3::boolean) result';values=[args.p_invoice_id,args.p_verified_actor_id,args.p_include_sources];}
  else {assert.equal(name,'zatca_apply_preparation_transition');sql='select public.zatca_apply_preparation_transition($1::text,$2::uuid,$3::uuid,$4::bigint,$5::uuid,$6::jsonb,$7::jsonb) result';values=[args.p_operation,args.p_invoice_id,args.p_document_id,args.p_expected_preparation_version,args.p_verified_actor_id,args.p_expected_source_snapshot,args.p_payload];}
  return {data:(await db.query(sql,values)).rows[0].result,error:null};
 }catch(error){return {data:null,error:{message:error.message,code:error.code}};}
}};
async function row(){return (await db.query('select * from public.zatca_invoice_documents where invoice_id=$1 and is_current',[invoice])).rows[0];}
async function context(sources=true){return (await rpcClient.rpc('zatca_read_preparation_context',{p_invoice_id:invoice,p_verified_actor_id:admin,p_include_sources:sources})).data;}
const has=(result,code)=>assert.ok(!result.ok&&result.blockers.some(b=>b.code===code),JSON.stringify(result));

before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create schema extensions; create table auth.users(id uuid primary key);
 create type public.app_role as enum ('customer','technician','maintenance_manager','admin_manager','super_admin');
 create function public.current_user_has_role(public.app_role[]) returns boolean language sql as $$ select false $$;`);
 const baseline=await readFile(new URL('../../supabase/migrations/20260929120000_schema_baseline.sql',import.meta.url),'utf8');
 // Use exact relevant baseline table definitions, not hand-written alternative schemas.
 for(const name of ['business_finance_settings','profiles','invoices','invoice_line_items','invoice_payments','service_request_payments']) {
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const definition=baseline.match(new RegExp(`create table public\\."${escaped}" \\([\\s\\S]*?\\n\\);`));
  assert.ok(definition,name);await db.exec(definition[0]);
  await db.exec(`alter table public.${name} add primary key(id);`);
 }
 await db.exec(await readFile(new URL('../../supabase/migrations/20260929210000_zatca_invoice_foundation.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20260930220811_zatca_preparation_layer.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20260930225817_zatca_local_persistence.sql',import.meta.url),'utf8'));
 await db.exec(`insert into public.profiles(id,role) values('${admin}','super_admin'),('${other}','customer');
 insert into public.business_finance_settings(id,legal_name,tax_number,vat_registered,tax_rate,currency,updated_at)
 values(true,'ZATCA_TEST_ONLY','300000000000003',true,15,'SAR','${at}');
 insert into public.business_tax_profiles(finance_settings_id,legal_name,vat_number,registration_scheme,registration_number,street,building_number,district,city,postal_code,country_code,is_active,updated_at)
 values(true,'ZATCA_TEST_ONLY','300000000000003','OTH','TESTONLY','TEST STREET','1234','TEST DISTRICT','TEST CITY','12345','SA',true,'${at}');
 insert into public.invoices(id,service_request_id,customer_name,customer_email,business_name,business_address,business_email,business_tax_number,vat_registered,description,subtotal,tax_rate,tax_amount,total,created_by,updated_at)
 values('${invoice}','${request}','ZATCA_TEST_ONLY','','ZATCA_TEST_ONLY','','','300000000000003',true,'TEST',50,15,7.50,57.50,'${admin}','${at}');
 insert into public.invoice_line_items(invoice_id,description,quantity,unit_price) values('${invoice}','ZATCA_TEST_ONLY SERVICE',1,57.50);`);
 adapter=await RpcPreparationAdapter.create(session(),()=>rpcClient,'https://tzqnljjlrkacnjqyogcj.supabase.co',()=>at);
});
after(async()=>{await db?.close();});

test('migration applied locally only; prepare and repeat prepare CAS',async()=>{
 assert.equal((await context()).document,null);
 const first=await adapter.run(invoice,'prepare',input());assert.equal(first.ok,true,JSON.stringify(first));assert.equal(first.value.version,1);
 const second=await adapter.run(invoice,'prepare',input());assert.equal(second.ok,true);assert.equal(second.value.version,2);
 assert.equal((await row()).issue_at,null);assert.equal((await row()).snapshot_frozen_at,null);
});
test('JSONB source comparison tolerates object key ordering without text serializers',async()=>{
 const reverseKeys=value=>Array.isArray(value)?value.map(reverseKeys):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,v])=>[key,reverseKeys(v)])):value;
 const client={rpc:async(name,args)=>rpcClient.rpc(name,name==='zatca_apply_preparation_transition'?{...args,p_expected_source_snapshot:reverseKeys(args.p_expected_source_snapshot)}:args)};
 const server=await RpcPreparationAdapter.create(session(),()=>client,'https://tzqnljjlrkacnjqyogcj.supabase.co',()=>at);
 const result=await server.run(invoice,'prepare',input());assert.equal(result.ok,true,JSON.stringify(result));
});
test('RPC CAS conflict leaves document unchanged',async()=>{
 const before=await row();
 const response=await rpcClient.rpc('zatca_apply_preparation_transition',{p_operation:'freeze',p_invoice_id:invoice,p_document_id:before.id,p_expected_preparation_version:'0',p_verified_actor_id:admin,p_expected_source_snapshot:before.prepared_source_snapshot,p_payload:{sourceFingerprint:before.source_fingerprint}});
 assert.equal(response.error.message,'DOCUMENT_VERSION_CONFLICT');assert.equal((await row()).preparation_version,before.preparation_version);
});
test('freeze source changed rejects atomically inside SQL RPC',async()=>{
 const d=await row();await db.exec(`update public.invoice_line_items set description='CHANGED' where invoice_id='${invoice}'`);
 const response=await rpcClient.rpc('zatca_apply_preparation_transition',{p_operation:'freeze',p_invoice_id:invoice,p_document_id:d.id,p_expected_preparation_version:String(d.preparation_version),p_verified_actor_id:admin,p_expected_source_snapshot:d.prepared_source_snapshot,p_payload:{sourceFingerprint:d.source_fingerprint}});
 assert.equal(response.error.message,'SOURCE_CHANGED');assert.equal((await row()).preparation_status,'prepared');
 has(await adapter.run(invoice,'freeze'),'SOURCE_CHANGED');
 assert.equal((await adapter.run(invoice,'prepare',input())).ok,true);
});
test('validate before freeze denied',async()=>has(await adapter.run(invoice,'canonical_validate'),'PREPARATION_STATE_INVALID'));
test('freeze unchanged uses DB timestamp and leaves commercial issuance unchanged',async()=>{
 const result=await adapter.run(invoice,'freeze');assert.equal(result.ok,true,JSON.stringify(result));
 const d=await row();assert.deepEqual(d.issue_at,d.snapshot_frozen_at);assert.equal(d.canonical_snapshot.invoice.issueAt,new Date(d.issue_at).toISOString());
 const commercial=(await db.query('select status,issued_at from public.invoices where id=$1',[invoice])).rows[0];assert.deepEqual(commercial,{status:'draft',issued_at:null});
});
test('second freeze fails and preserves original timestamp',async()=>{
 const before=await row();has(await adapter.run(invoice,'freeze'),'PREPARATION_STATE_INVALID');assert.deepEqual((await row()).issue_at,before.issue_at);
});
test('prepare after freeze requires revision',async()=>has(await adapter.run(invoice,'prepare',input()),'REVISION_REQUIRED'));
test('trigger denies each frozen commercial field overwrite',async()=>{
 const patches=["canonical_snapshot='{}'::jsonb","snapshot_version=2","rules_version='OTHER'","source_fingerprint='OTHER'","snapshot_frozen_at=null","issue_at=null","revision_no=2","invoice_uuid=gen_random_uuid()","invoice_id=gen_random_uuid()","supersedes_document_id=gen_random_uuid()","preparation_input='{}'::jsonb","prepared_source_snapshot='{}'::jsonb","invoice_kind='standard'","id=gen_random_uuid()"];
 for(const patch of patches)await assert.rejects(db.exec(`update public.zatca_invoice_documents set ${patch} where invoice_id='${invoice}' and is_current`),/FROZEN_DOCUMENT_IMMUTABLE/);
});
test('trigger denies frozen deletion and invalid lifecycle regression',async()=>{
 await assert.rejects(db.exec(`delete from public.zatca_invoice_documents where invoice_id='${invoice}'`),/FROZEN_DOCUMENT_IMMUTABLE/);
 await assert.rejects(db.exec(`update public.zatca_invoice_documents set preparation_status='draft' where invoice_id='${invoice}'`),/PREPARATION_STATE_INVALID/);
});
test('canonical validation rejects different snapshot identity at RPC boundary',async()=>{
 const d=await row();
 const res=await rpcClient.rpc('zatca_apply_preparation_transition',{p_operation:'canonical_validate',p_invoice_id:invoice,p_document_id:d.id,p_expected_preparation_version:String(d.preparation_version),p_verified_actor_id:admin,p_payload:{valid:true,snapshot:{},snapshotVersion:1,rulesVersion:d.rules_version,sourceFingerprint:d.source_fingerprint}});
 assert.equal(res.error.message,'CANONICAL_INVALID');assert.equal((await row()).preparation_status,'frozen');
});
test('frozen validation succeeds after new payment, line and seller changes',async()=>{
 const before=await row();
 await db.exec(`insert into public.invoice_payments(invoice_id,amount,method,recorded_by) values('${invoice}',1,'cash','${admin}');
 update public.invoice_line_items set description='LATER CHANGE';
 update public.business_tax_profiles set legal_name='LATER SELLER';`);
 const snapshotOnly={rpc:async(name,args)=>{if(name==='zatca_read_preparation_context')assert.equal(args.p_include_sources,false);return rpcClient.rpc(name,args);}};
 const isolated=await RpcPreparationAdapter.create(session(),()=>snapshotOnly,'https://tzqnljjlrkacnjqyogcj.supabase.co',()=>at);
 const definition=(await db.query("select pg_get_functiondef('zatca_private.source_envelope(uuid)'::regprocedure) definition")).rows[0].definition;
 await db.exec(`create or replace function zatca_private.source_envelope(p_invoice_id uuid) returns jsonb language plpgsql stable set search_path='' as $$ begin raise exception 'LIVE_SOURCE_RELOAD_FORBIDDEN'; end $$;`);
 let result;
 try {result=await isolated.run(invoice,'canonical_validate');} finally {await db.exec(definition);}
 assert.equal(result.ok,true,JSON.stringify(result));
 const d=await row();assert.deepEqual(d.canonical_snapshot,before.canonical_snapshot);assert.equal(d.preparation_status,'canonical_validated');assert.equal(BigInt(d.preparation_version),BigInt(before.preparation_version)+1n);
});
test('revision insert failure rolls back superseding previous row',async()=>{
 const old=await row();
 await db.exec(`create function public.test_fail_revision() returns trigger language plpgsql as $$ begin raise exception 'LOCAL_TEST_INSERT_FAIL'; end $$;
 create trigger test_fail_revision before insert on public.zatca_invoice_documents for each row execute function public.test_fail_revision();`);
 const result=await adapter.run(invoice,'create_revision');has(result,'PERSISTENCE_UNAVAILABLE');
 assert.equal((await row()).id,old.id);assert.equal((await row()).preparation_status,old.preparation_status);assert.equal((await row()).preparation_version,old.preparation_version);
 await db.exec('drop trigger test_fail_revision on public.zatca_invoice_documents; drop function public.test_fail_revision();');
});
test('revision gets new UUID; old superseded CAS++; no artifact carryover',async()=>{
 // Simulate future integration metadata: trigger must permit it, revision must not copy it.
 await db.exec(`update public.zatca_invoice_documents set unsigned_xml='LOCAL_TEST_SENTINEL',xml_hash='LOCAL_TEST_SENTINEL',previous_invoice_hash='LOCAL_TEST_SENTINEL',response_payload='{"test":true}' where invoice_id='${invoice}'`);
 const old=await row();const result=await adapter.run(invoice,'create_revision');assert.equal(result.ok,true,JSON.stringify(result));
 const next=await row();assert.equal(next.revision_no,old.revision_no+1);assert.notEqual(next.id,old.id);assert.notEqual(next.invoice_uuid,old.invoice_uuid);assert.equal(next.supersedes_document_id,old.id);assert.equal(String(next.preparation_version),'0');
 for(const field of ['canonical_snapshot','prepared_source_snapshot','preparation_input','source_fingerprint','issue_at','snapshot_frozen_at','canonical_validated_at','icv','previous_invoice_hash','unsigned_xml','signed_xml','xml_hash','qr_code_base64','response_payload','egs_unit_id'])assert.equal(next[field],null,field);
 const previous=(await db.query('select * from public.zatca_invoice_documents where id=$1',[old.id])).rows[0];assert.equal(previous.is_current,false);assert.equal(previous.preparation_status,'superseded');assert.equal(BigInt(previous.preparation_version),BigInt(old.preparation_version)+1n);assert.deepEqual(previous.canonical_snapshot,old.canonical_snapshot);
});
test('create revision before freeze denied',async()=>has(await adapter.run(invoice,'create_revision'),'REVISION_REQUIRED'));
test('server denies anon/customer/technician/maintenance_manager before privileged factory',async()=>{
 let calls=0;for(const role of ['customer','technician','maintenance_manager'])await assert.rejects(RpcPreparationAdapter.create(session(role),()=>{calls++;return rpcClient;},'https://tzqnljjlrkacnjqyogcj.supabase.co'),/FORBIDDEN/);
 await assert.rejects(RpcPreparationAdapter.create(session('super_admin',null),()=>{calls++;return rpcClient;},'https://tzqnljjlrkacnjqyogcj.supabase.co'),/AUTH_REQUIRED/);assert.equal(calls,0);
 for(const role of ['admin_manager','super_admin'])assert.ok(await RpcPreparationAdapter.create(session(role),()=>rpcClient,'https://tzqnljjlrkacnjqyogcj.supabase.co'));
});
test('DB rejects actor role spoof and revoked server role',async()=>{
 const res=await rpcClient.rpc('zatca_read_preparation_context',{p_invoice_id:invoice,p_verified_actor_id:other,p_include_sources:false});assert.equal(res.error.message,'FORBIDDEN');
 await db.exec(`update public.profiles set role='customer' where id='${admin}'`);has(await adapter.run(invoice,'create_revision'),'FORBIDDEN');await db.exec(`update public.profiles set role='super_admin' where id='${admin}'`);
});
test('RPC operation whitelist and arbitrary payload rejected',async()=>{
 const d=await row();
 const args={p_invoice_id:invoice,p_document_id:d.id,p_expected_preparation_version:String(d.preparation_version),p_verified_actor_id:admin,p_payload:{}};
 assert.equal((await rpcClient.rpc('zatca_apply_preparation_transition',{...args,p_operation:'issue'})).error.message,'RPC_OPERATION_INVALID');
 assert.equal((await rpcClient.rpc('zatca_apply_preparation_transition',{...args,p_operation:'create_revision',p_payload:{arbitraryPatch:true}})).error.message,'CANONICAL_INVALID');
 has(await adapter.run(invoice,'issue'),'RPC_OPERATION_INVALID');
});
test('SQL execution grants exclude browser roles; service role RPC works',async()=>{
 for(const role of ['anon','authenticated']) {
  for(const signature of ['public.zatca_read_preparation_context(uuid,uuid,boolean)','public.zatca_apply_preparation_transition(text,uuid,uuid,bigint,uuid,jsonb,jsonb)'])assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,signature])).rows[0].allowed,false);
  await db.exec(`set role ${role}`);await assert.rejects(db.query('select public.zatca_read_preparation_context($1,$2,false)',[invoice,admin]),/permission denied/);await db.exec('reset role');
 }
 await db.exec('set role service_role');const result=await context(false);assert.ok(result.document);await db.exec('reset role');
});
test('normalization/hash deterministic; ignored fields excluded; transfer marker affects hash',async()=>{
 const raw=(await context()).sources;const a=normalizeSourceEnvelope(raw);const b=normalizeSourceEnvelope({...raw,privateKey:'SENTINEL',lines:[...raw.lines].reverse(),payments:[...raw.payments].reverse()});assert.deepEqual(a,b);assert.equal(sourceFingerprint(a,input()),sourceFingerprint(b,input()));
 b.payments[0].voidedAt=at;assert.notEqual(sourceFingerprint(a,input()),sourceFingerprint(b,input()));assert.ok(!JSON.stringify(b).includes('SENTINEL'));
});
test('source markers preserve changes below one millisecond',async()=>{
 const a=normalizeSourceEnvelope((await context()).sources),b=structuredClone(a);
 b.invoice.updatedAt='2026-10-01T00:00:00.000001Z';
 a.invoice.updatedAt='2026-10-01T00:00:00.000000Z';
 assert.notEqual(sourceFingerprint(a,input()),sourceFingerprint(b,input()));
});
test('concurrency failures and version conflict map to deterministic codes',()=>{
 assert.equal(mapPersistenceFailure({code:'55P03',message:'timeout'}),'CONCURRENCY_RETRY_REQUIRED');assert.equal(mapPersistenceFailure({code:'40P01',message:'deadlock'}),'CONCURRENCY_RETRY_REQUIRED');assert.equal(mapPersistenceFailure({message:'CONCURRENCY_RETRY_REQUIRED'}),'CONCURRENCY_RETRY_REQUIRED');assert.equal(mapPersistenceFailure({message:'DOCUMENT_VERSION_CONFLICT'}),'DOCUMENT_VERSION_CONFLICT');assert.equal(mapPersistenceFailure({message:'unknown internal secret'}),'PERSISTENCE_UNAVAILABLE');
});
test('SQL maps lock timeout/deadlock exceptions without partial writes',async()=>{
 const d=await row();
 const definition=(await db.query("select pg_get_functiondef('zatca_private.source_envelope(uuid)'::regprocedure) definition")).rows[0].definition;
 for(const sqlstate of ['55P03','40P01']) {
  await db.exec(`create or replace function zatca_private.source_envelope(p_invoice_id uuid) returns jsonb language plpgsql stable set search_path='' as $$ begin raise exception using errcode='${sqlstate}',message='LOCAL_SIMULATED_CONCURRENCY_FAILURE'; end $$;`);
  try {
   const response=await rpcClient.rpc('zatca_apply_preparation_transition',{p_operation:'prepare',p_invoice_id:invoice,p_document_id:d.id,p_expected_preparation_version:String(d.preparation_version),p_verified_actor_id:admin,p_payload:{}});
   assert.equal(response.error.message,'CONCURRENCY_RETRY_REQUIRED');assert.equal((await row()).preparation_version,d.preparation_version);
  } finally {await db.exec(definition);}
 }
});
test('new constraints reject negative version, arrays, and incomplete prepared state',async()=>{
 for(const patch of ["preparation_version=-1","preparation_input='[]'::jsonb","prepared_source_snapshot='[]'::jsonb","preparation_status='prepared'"])await assert.rejects(db.exec(`update public.zatca_invoice_documents set ${patch} where invoice_id='${invoice}' and is_current`),/violates check constraint/);
});
test('Test project guard rejects Production before auth/client creation',async()=>{
 await assert.rejects(RpcPreparationAdapter.create({},()=>{throw new Error('must not instantiate');},'https://wtmzvznsmitqmjgqwtnu.supabase.co'),PersistenceError);
});

test('anonymous auth user cannot obtain privileged adapter even with supplied admin role',async()=>{
 const anonymous=session();anonymous.auth.getUser=async()=>({data:{user:{id:admin,is_anonymous:true}},error:null});
 await assert.rejects(RpcPreparationAdapter.create(anonymous,()=>{throw new Error('must not instantiate');},'https://tzqnljjlrkacnjqyogcj.supabase.co'),/AUTH_REQUIRED/);
});
test('simultaneous adapter prepares/freezes resolve through version CAS',async()=>{
 // PGlite serializes transactions: this proves stale-read CAS, not multi-session locks.
 await db.exec(`update public.business_tax_profiles set legal_name='ZATCA_TEST_ONLY';update public.invoice_payments set voided_at=now();`);
 const prepareResults=await Promise.all([adapter.run(invoice,'prepare',input()),adapter.run(invoice,'prepare',input())]);
 assert.equal(prepareResults.filter(r=>r.ok).length,1);has(prepareResults.find(r=>!r.ok),'DOCUMENT_VERSION_CONFLICT');
 const freezeResults=await Promise.all([adapter.run(invoice,'freeze'),adapter.run(invoice,'freeze')]);
 assert.equal(freezeResults.filter(r=>r.ok).length,1);has(freezeResults.find(r=>!r.ok),'DOCUMENT_VERSION_CONFLICT');
});

test('transport exceptions become non-leaking persistence failures',async()=>{
 const server=await RpcPreparationAdapter.create(session(),()=>({rpc:async()=>{throw new Error('INTERNAL_TEST_SENTINEL');}}),'https://tzqnljjlrkacnjqyogcj.supabase.co');
 has(await server.run(invoice,'canonical_validate'),'PERSISTENCE_UNAVAILABLE');
});
test('browser table mutation privileges remain revoked',async()=>{
 for(const role of ['anon','authenticated'])for(const table of ['public.zatca_invoice_documents','public.business_tax_profiles'])for(const privilege of ['INSERT','UPDATE','DELETE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,table,privilege])).rows[0].allowed,false);
});

 test('runtime target guard rejects old Test and unapproved origins before auth',async()=>{
 let calls=0;
 const forbiddenSession={auth:{getUser:async()=>{calls++;throw new Error('must not reach auth');}}};
 for(const url of ['https://xpvwkelctzgidpycflzw.supabase.co','https://unapproved.supabase.co','https://tzqnljjlrkacnjqyogcj.supabase.co.attacker.invalid','http://tzqnljjlrkacnjqyogcj.supabase.co']) {
  await assert.rejects(RpcPreparationAdapter.create(forbiddenSession,()=>{calls++;return rpcClient;},url),/FORBIDDEN/);
 }
 assert.equal(calls,0);
 });
