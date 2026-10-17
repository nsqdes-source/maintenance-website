"use server";
import {createClient} from "@/lib/supabase/server";
import {technicianCollectionActivationReady,type PaymentOperations} from "@/lib/technician-collections";
export async function loadPaymentOperations(offset=0) {
 try {const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return {ok:false as const,message:"يرجى تسجيل الدخول."};const {data:profile}=await db.from("profiles").select("role").eq("id",user.id).maybeSingle();if(!profile || !["admin_manager","super_admin"].includes(profile.role))return {ok:false as const,message:"غير مصرح لك."};if(!Number.isInteger(offset)||offset<0||offset>100000)return {ok:false as const,message:"طلب الصفحة غير صالح."};const {data,error}=await db.rpc("finance_get_payment_operations",{p_limit:50,p_offset:offset});return error?{ok:false as const,message:"تعذر تحميل العمليات."}:{ok:true as const,context:data as PaymentOperations};}catch{return {ok:false as const,message:"تعذر تحميل العمليات."};}
}
export async function decidePaymentOperation(id:string,operation:"settle"|"verify"|"reject"|"post"|"void",key:string,reason="") {
 const context=await loadPaymentOperations();if(!context.ok)return context;
 if(!context.context.payment_domain_enabled)return {ok:false,message:"مسار التحصيل غير مفعّل.",code:"payment_domain_not_enabled"};
 if(!technicianCollectionActivationReady)return {ok:false,message:"التفعيل التشغيلي لم يعتمد بعد.",code:"collection_activation_blocked"};
 if(!/^[0-9a-f-]{36}$/i.test(id)||!key.trim()||key.length>200||!["settle","verify","reject","post","void"].includes(operation)||(["reject","void"].includes(operation)&&(!reason.trim()||reason.length>500)))return {ok:false,message:"بيانات العملية غير صالحة."};
 try {const db=await createClient();const calls={settle:["finance_settle_technician_cash_collection",{p_collection_id:id,p_idempotency_key:key}],verify:["finance_verify_technician_collection",{p_collection_id:id,p_verify:true}],reject:["finance_verify_technician_collection",{p_collection_id:id,p_verify:false,p_rejection_reason:reason.trim()}],post:["finance_post_verified_technician_collection",{p_collection_id:id,p_idempotency_key:key}],void:["finance_void_technician_collection_record",{p_collection_id:id,p_reason:reason.trim()}]} as const;const [rpc,args]=calls[operation];const {error}=await db.rpc(rpc,args);return error?{ok:false,message:"تعذر تنفيذ العملية. راجع حالتها قبل إعادة المحاولة."}:{ok:true,message:"تم تنفيذ العملية."};}catch{return {ok:false,message:"تعذر تنفيذ العملية."};}
}
