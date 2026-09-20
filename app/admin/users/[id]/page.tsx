import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { id } = await params;
  const { data: details, error } = await supabase.rpc("admin_get_user_details", { target_user_id: id }).single();
  if (error || !details) notFound();
  const customer = details as { full_name: string | null; phone: string | null; email: string | null; role: string; created_at: string };
  const { data: requests } = await supabase.from("service_requests")
    .select("id,service_type,city,workflow_stage,created_at,archived_at")
    .eq("customer_id", id).order("created_at", { ascending: false });
  return <main className="adminPage"><div className="container adminContainer">
    <div className="adminTopbar"><div><p className="eyebrow">ملف العميل</p><h1>{customer.full_name || "عميل"}</h1></div><Link className="button secondary" href="/admin/users">العودة للمستخدمين</Link></div>
    <section className="card"><h2>بيانات الحساب</h2><div className="detailFields">
      <div><span>الاسم</span><strong>{customer.full_name || "—"}</strong></div>
      <div><span>الجوال</span><strong>{customer.phone || "—"}</strong></div>
      <div><span>البريد</span><strong>{customer.email || "—"}</strong></div>
      <div><span>الدور</span><strong>{customer.role}</strong></div>
      <div><span>تاريخ التسجيل</span><strong>{new Date(customer.created_at).toLocaleString("ar-SA")}</strong></div>
    </div></section>
    <section className="adminTableWrap"><div className="requestTableHeader"><span>طلبات العميل: {requests?.length ?? 0}</span></div>
      {!requests?.length ? <div className="emptyState">لا توجد طلبات لهذا الحساب.</div> :
      <table className="adminTable"><thead><tr><th>الخدمة</th><th>المدينة</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>
        {requests.map(request => <tr key={request.id}><td><Link href={`/admin/requests/${request.id}`}>{request.service_type}</Link></td><td>{request.city}</td><td>{request.workflow_stage}{request.archived_at ? " · مؤرشف" : ""}</td><td>{new Date(request.created_at).toLocaleString("ar-SA")}</td></tr>)}
      </tbody></table>}
    </section>
  </div></main>;
}


