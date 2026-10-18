import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import PaymentOperationsClient from "./PaymentOperationsClient";
import {loadPaymentOperations} from "./actions";
export const dynamic="force-dynamic";
export default async function PaymentOperationsPage(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/admin/login");const {data:profile}=await db.from("profiles").select("role").eq("id",user.id).maybeSingle();if(!profile||!["admin_manager","super_admin"].includes(profile.role))redirect("/admin");
 const result=await loadPaymentOperations();return <main className="adminPage financePortal"><div className="container adminContainer"><h1>عمليات التحصيل</h1><p>العهدة والتحقق قبل التسجيل المالي؛ دفتر التحصيلات المؤكدة يبقى مستقلًا.</p>{result.ok?<PaymentOperationsClient initialContext={result.context}/>:<p role="alert">{result.message}</p>}</div></main>;
}
