import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const ADMIN_ROLES = new Set(["maintenance_manager", "admin_manager", "super_admin"]);

export default async function AdminTechniciansPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) redirect("/account");
  const { data: technicians, error } = await supabase.from("technicians").select("id, profile_id, service_types, is_active, notes, created_at, profile:profiles(full_name, phone)").order("created_at", { ascending: false });

  return <main className="adminPage"><div className="container adminContainer">
    <div className="adminTopbar"><div><p className="eyebrow">إدارة الفنيين</p><h1>الفنيون</h1></div><a className="button secondary" href="/admin">لوحة الإدارة</a></div>
    {error ? <div className="form-error">تعذر تحميل الفنيين.</div> : !technicians?.length ? <div className="emptyState"><h2>لا يوجد فنيون حتى الآن</h2><p>ستظهر سجلات الفنيين هنا عند إضافتهم إلى النظام.</p></div> : <div className="adminTableWrap"><table className="adminTable"><thead><tr><th>الفني</th><th>الجوال</th><th>الخدمات</th><th>الحالة</th><th>الملاحظات</th><th>تاريخ الإضافة</th></tr></thead><tbody>{technicians.map((technician) => { const p = Array.isArray(technician.profile) ? technician.profile[0] : technician.profile; return <tr key={technician.id}><td>{p?.full_name || "فني بدون اسم"}</td><td>{p?.phone || "—"}</td><td>{technician.service_types?.length ? technician.service_types.join(" · ") : "—"}</td><td><span className={`statusBadge ${technician.is_active ? "status-active" : "status-inactive"}`}>{technician.is_active ? "نشط" : "غير نشط"}</span></td><td className="descriptionCell">{technician.notes || "—"}</td><td>{new Date(technician.created_at).toLocaleString("ar-SA")}</td></tr>; })}</tbody></table></div>}
  </div></main>;
}
