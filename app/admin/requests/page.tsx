import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RequestStatusControl from "@/app/admin/RequestStatusControl";

export const dynamic = "force-dynamic";
const ADMIN_ROLES = new Set(["maintenance_manager", "admin_manager", "super_admin"]);
const STATUS_LABELS: Record<string, string> = { new: "جديد", contacted: "تم التواصل", scheduled: "مجدول", completed: "مكتمل", cancelled: "ملغي" };

export default async function AdminRequestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) redirect("/account");
  const { data: requests, error } = await supabase.from("service_requests").select("id, customer_name, phone, service_type, problem_description, city, address, status, created_at").order("created_at", { ascending: false });

  return <main className="adminPage"><div className="container adminContainer">
    <div className="adminTopbar"><div><p className="eyebrow">إدارة الطلبات</p><h1>طلبات الخدمة</h1></div><a className="button secondary" href="/admin">لوحة الإدارة</a></div>
    {error ? <div className="form-error">تعذر تحميل الطلبات.</div> : !requests?.length ? <div className="emptyState"><h2>لا توجد طلبات حتى الآن</h2><p>ستظهر طلبات العملاء هنا عند إرسالها من نموذج الموقع.</p></div> : <div className="adminTableWrap"><table className="adminTable"><thead><tr><th>العميل</th><th>الخدمة</th><th>المدينة</th><th>الجوال</th><th>الوصف</th><th>الحالة</th><th>تاريخ الطلب</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td>{request.customer_name}</td><td>{request.service_type}</td><td>{request.city}</td><td><a href={`tel:${request.phone}`}>{request.phone}</a></td><td className="descriptionCell">{request.problem_description}<small>{request.address}</small></td><td><span className={`statusBadge status-${request.status}`}>{STATUS_LABELS[request.status] ?? request.status}</span><RequestStatusControl requestId={request.id} initialStatus={request.status} /></td><td>{new Date(request.created_at).toLocaleString("ar-SA")}</td></tr>)}</tbody></table></div>}
  </div></main>;
}
