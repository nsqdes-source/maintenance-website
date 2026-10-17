"use server";
import {createClient} from "@/lib/supabase/server";
import {technicianCollectionActivationReady,type CollectionContext,type CollectionMethod} from "@/lib/technician-collections";
export async function getCollectionContext(requestId:string) {
 try {
  const db=await createClient(); const {data:{user}}=await db.auth.getUser();
  if(!user) return {ok:false as const,message:"يرجى تسجيل الدخول."};
  const {data:profile}=await db.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if(profile?.role!=="technician") return {ok:false as const,message:"غير مصرح لك."};
  const {data,error}=await db.rpc("technician_get_collection_context",{p_request_id:requestId});
  if(error) return {ok:false as const,message:"تعذر تحميل بيانات التحصيل لهذا الطلب."};
  return {ok:true as const,context:data as CollectionContext};
 } catch {return {ok:false as const,message:"تعذر تحميل بيانات التحصيل."};}
}
export async function recordTechnicianCollection(requestId:string,method:CollectionMethod,amount:number,key:string) {
 const result=await getCollectionContext(requestId);
 if(!result.ok) return result;
 if(!result.context.payment_domain_enabled) return {ok:false,message:"مسار التحصيل غير مفعّل.",code:"payment_domain_not_enabled"};
 if(!technicianCollectionActivationReady) return {ok:false,message:"التحصيل التشغيلي لم يعتمد بعد.",code:"collection_activation_blocked"};
 if(!result.context.collection_allowed || result.context.payable_now===null || !Number.isFinite(amount) || amount<=0 || amount>Number(result.context.payable_now) || !["cash","bank_transfer","card","other"].includes(method) || !key.trim() || key.length>200) return {ok:false,message:"بيانات التحصيل غير صالحة."};
 try {const db=await createClient();const {error}=await db.rpc("technician_record_collection",{p_service_request_id:requestId,p_method:method,p_amount:amount,p_idempotency_key:key});return error?{ok:false,message:"تعذر تسجيل التحصيل. تحقق من حالة الطلب قبل إعادة المحاولة."}:{ok:true,message:method==="cash"?"في عهدتك — بانتظار التسوية":"بانتظار تحقق الإدارة المالية"};} catch{return {ok:false,message:"تعذر تسجيل التحصيل."};}
}
