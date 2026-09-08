import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UserRoleControl from "@/app/admin/UserRoleControl";

export const dynamic = "force-dynamic";
const ADMIN_ROLES = new Set(["maintenance_manager", "admin_manager", "super_admin"]);
const ROLE_LABELS: Record<string, string> = { customer: "عميل", technician: "فني", maintenance_manager: "مدير صيانة", admin_manager: "مدير إداري", super_admin: "مدير عام" };

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) redirect("/account");

  const [{ data: users, error }, { data: requests }, { data: technicians }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, role, created_at").order("created_at", { ascending: false }),
    supabase.from("service_requests").select("customer_id"),
    supabase.from("technicians").select("profile_id, service_types"),
  ]);

  const requestCounts = new Map<string, number>();
  for (const request of requests ?? []) {
    if (request.customer_id) requestCounts.set(request.customer_id, (requestCounts.get(request.customer_id) ?? 0) + 1);
  }

  const technicianServices = new Map<string, string[]>();
  for (const technician of technicians ?? []) {
    technicianServices.set(technician.profile_id, technician.service_types ?? []);
  }

  return <main className="adminPage"><div className="container adminContainer">
    <div className="adminTopbar"><div><p className="eyebrow">إدارة المستخدمين</p><h1>المستخدمون</h1></div><a className="button secondary" href="/admin">لوحة الإدارة</a></div>
    {error ? <div className="form-error">تعذر تحميل المستخدمين.</div> : !users?.length ? <div className="emptyState"><h2>لا يوجد مستخدمون حتى الآن</h2><p>سيظهر العملاء وموظفو النظام هنا عند إنشاء حساباتهم.</p></div> : <div className="adminTableWrap"><table className="adminTable"><thead><tr><th>الاسم</th><th>الجوال</th><th>الدور</th><th>عدد الطلبات</th><th>تاريخ التسجيل</th><th>تعديل الدور</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td>{item.full_name || "مستخدم بدون اسم"}</td><td>{item.phone || "—"}</td><td><span className="roleBadge">{ROLE_LABELS[item.role] ?? item.role}</span></td><td>{requestCounts.get(item.id) ?? 0}</td><td>{new Date(item.created_at).toLocaleString("ar-SA")}</td><td><UserRoleControl userId={item.id} initialRole={item.role} isCurrentUser={item.id === user.id} initialTechnicianServices={technicianServices.get(item.id) ?? []} /></td></tr>)}</tbody></table></div>}
  </div></main>;
}
