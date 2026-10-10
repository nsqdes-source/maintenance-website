"use server";
import { createClient } from "@/lib/supabase/server";
import type { PaymentPolicy } from "./policy";
export async function savePaymentSettings(policy: PaymentPolicy, version: number, provider: string | null) {
 try {
  const db = await createClient();
  const {data:{user}} = await db.auth.getUser();
  if (!user) return {ok:false,message:"يرجى تسجيل الدخول مجددًا."};
  const {data:profile} = await db.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if (!profile || !["admin_manager","super_admin"].includes(profile.role)) return {ok:false,message:"غير مصرح لك بتعديل إعدادات الدفع."};
  if (!Number.isSafeInteger(version) || version < 1 || (provider !== null && typeof provider !== "string")) return {ok:false,message:"بيانات الحفظ غير صالحة."};
  const {data,error} = await db.rpc("finance_save_payment_settings",{p_policy:policy,p_expected_policy_version:version,p_gateway_provider:provider});
  if (error) {
   const messages: Record<string,string> = {
    finance_settings_not_initialized:"الإعدادات الأساسية للمنشأة غير مهيأة.",
    payment_policy_version_conflict:"تغيرت السياسة منذ فتح الصفحة. أعد تحميل الصفحة قبل الحفظ.",
    invalid_payment_policy_v1:"سياسة الدفع غير صالحة. تحقق من التوقيت وطرق الدفع.",
    invalid_gateway_provider:"أدخل اسم مزود غير سري من 1 إلى 100 حرف دون رموز اعتماد.",
    payment_settings_phase3_gate_closed:"لا يمكن الحفظ من هذه الصفحة بعد تفعيل مسار الدفع.",
    insufficient_privilege:"غير مصرح لك بتعديل إعدادات الدفع."
   };
   return {ok:false,message:messages[error.message] ?? "تعذر حفظ الإعدادات. حاول مجددًا."};
  }
  return {ok:true,message:"تم حفظ إعدادات الدفع دون تفعيل مسار الدفع أو البوابة.",version:Number(data)};
 } catch { return {ok:false,message:"تعذر الاتصال لحفظ الإعدادات. حاول مجددًا."}; }
}
