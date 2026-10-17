import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PaymentSettingsClient from "./PaymentSettingsClient";
import type { PaymentSettings } from "./policy";
export const dynamic = "force-dynamic";
export default async function PaymentSettingsPage() {
 const db = await createClient();
 const {data:{user}} = await db.auth.getUser();
 if (!user) redirect("/admin/login");
 const {data:profile} = await db.from("profiles").select("role").eq("id",user.id).maybeSingle();
 if (!profile || !["admin_manager","super_admin"].includes(profile.role)) redirect("/admin");
 const {data,error} = await db.from("business_finance_settings").select("payment_policy,payment_policy_version,payment_domain_enabled,gateway_enabled,gateway_provider,gateway_environment").eq("id",true).maybeSingle();
 return <main className="adminPage financePortal"><div className="container adminContainer">
  <div className="adminTopbar"><div><p className="eyebrow">الإدارة المالية</p><h1>إعدادات الدفع</h1></div><Link className="button secondary" href="/admin/finance">العودة للنظرة العامة</Link></div>
  {error ? <section className="card financePanel" role="alert">تعذر تحميل إعدادات الدفع. أعد المحاولة.</section> : <PaymentSettingsClient initialSettings={data as PaymentSettings | null} />}
 </div></main>;
}
