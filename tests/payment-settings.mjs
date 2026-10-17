import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const root='app/admin/finance/payment-settings/';
function load(file,mocks={}) {
 const code=ts.transpileModule(readFileSync(root+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,require:name=>name in mocks?mocks[name]:require(name),Set,Number});return exports;
}
const policy={schema_version:1,original_timing:'customer_choice',allow_pay_on_arrival:true,allow_pay_after_completion:true,additional_timing:'customer_choice',allow_work_before_balance:true,allowed_methods:['cash'],inspection_included_in_final:true,retain_earned_inspection_on_rejection:true,refund_excess:true};
const settings={payment_policy:policy,payment_policy_version:1,gateway_provider:null,gateway_environment:'test',gateway_enabled:false,payment_domain_enabled:false};
function db(role,error=null,record=settings){let calls=[];return {calls,auth:{getUser:async()=>({data:{user:role==='anon'?null:{id:'session-user'}}})},from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='profiles'?{role}:record,error:null})})})}),rpc:async(name,args)=>{calls.push({name,args});return {data:2,error};}};}
for(const role of ['anon','customer','technician','maintenance_manager','admin_manager','super_admin']) {
 test('page and save role '+role,async()=>{
  const client=db(role);
  const Page=load('page.tsx',{'@/lib/supabase/server':{createClient:async()=>client},'next/navigation':{redirect:path=>{throw Error(path)}},'next/link':{default:({children})=>children},'./PaymentSettingsClient':{default:()=>null}}).default;
  const action=load('actions.ts',{'@/lib/supabase/server':{createClient:async()=>client}}).savePaymentSettings;
  const allowed=['admin_manager','super_admin'].includes(role);
  if(allowed)await Page();else await assert.rejects(Page(),{message:role==='anon'?'/admin/login':'/admin'});
  const result=await action(policy,1,null);assert.equal(result.ok,allowed);assert.equal(client.calls.length,allowed?1:0);
  if(allowed){assert.equal(client.calls[0].name,'finance_save_payment_settings');assert.deepEqual(Object.keys(client.calls[0].args).sort(),['p_expected_policy_version','p_gateway_provider','p_policy']);}
 });
}
const Client=load('PaymentSettingsClient.tsx',{'./actions':{savePaymentSettings:async()=>({ok:true})},'./policy':load('policy.ts')}).default;
test('missing singleton renders disabled save without defaults',()=>{const html=renderToStaticMarkup(React.createElement(Client,{initialSettings:null}));assert.match(html,/الإعدادات الأساسية للمنشأة غير مهيأة/);assert.match(html,/disabled/);assert.doesNotMatch(html,/input|select/);});
test('UI renders locked gates and contract controls',()=>{const html=renderToStaticMarkup(React.createElement(Client,{initialSettings:settings}));assert.match(html,/الدفع المسبق إلزامي/);assert.match(html,/readOnly="" value="test"/);assert.match(html,/تصنيف لسجل التحصيل فقط/);assert.doesNotMatch(html,/allow_prepay/);});
for(const [timing,label] of [['pay_on_arrival','السماح بالدفع عند وصول الفني'],['pay_after_completion','السماح بالدفع بعد التنفيذ']])test('required collection toggle locked '+timing,()=>{const html=renderToStaticMarkup(React.createElement(Client,{initialSettings:{...settings,payment_policy:{...policy,original_timing:timing}}}));assert.ok(html.includes('disabled="" checked=""/> '+label));});
for(const message of ['payment_policy_version_conflict','finance_settings_not_initialized','invalid_payment_policy_v1','invalid_gateway_provider','payment_settings_phase3_gate_closed','SQL WITH SECRET'])test('safe Arabic error '+message,async()=>{const client=db('admin_manager',{message});const action=load('actions.ts',{'@/lib/supabase/server':{createClient:async()=>client}}).savePaymentSettings;const result=await action(policy,1,null);assert.equal(result.ok,false);assert.notEqual(result.message,message);assert.match(result.message,/[\u0600-\u06ff]/);});
