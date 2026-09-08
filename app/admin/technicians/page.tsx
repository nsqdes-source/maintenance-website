import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AddTechnicianForm from "@/app/admin/AddTechnicianForm";

export const dynamic = "force-dynamic";
const ADMIN_ROLES = new Set(["maintenance_manager", "admin_manager", "super_admin"]);

type ProfileOption = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
};

export default async function AdminTechniciansPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) redirect("/account");

  const [{ data: technicians, error }, { data: technicianLinks }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase
      .from("technicians")
      .select("id, profile_id, service_types, is_active, notes, created_at, profile:profiles(full_name, phone)")
      .order("created_at", { ascending: false }),
    supabase.from("technicians").select("profile_id"),
    supabase
      .from("profiles")
      .select("id, full_name, phone, role")
      .in("role", ["customer", "technician"])
      .order("created_at", { ascending: false }),
  ]);

  const existingTechnicianIds = new Set((technicianLinks ?? []).map((item) => item.profile_id));
  const availableUsers: ProfileOption[] = (profiles ?? []).filter((item) => !existingTechnicianIds.has(item.id));

  return (
    <main className="adminPage">
      <div className="container adminContainer">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">إدارة الفنيين</p>
            <h1>الفنيون</h1>
          </div>
          <div className="adminTopbarActions">
            <a className="button primary" href="#add-technician">إضافة فني جديد</a>
            <a className="button secondary" href="/admin">لوحة الإدارة</a>
          </div>
        </div>

        <AddTechnicianForm users={availableUsers} />
        {profilesError ? <div className="form-error">تعذر تحميل قائمة المستخدمين لإضافة الفني.</div> : null}

        {error ? (
          <div className="form-error">تعذر تحميل الفنيين.</div>
        ) : !technicians?.length ? (
          <div className="emptyState">
            <h2>لا يوجد فنيون حتى الآن</h2>
            <p>أضف فنيًا من مستخدم مسجل، وستظهر بياناته هنا.</p>
          </div>
        ) : (
          <div className="adminTableWrap">
            <table className="adminTable">
              <thead>
                <tr>
                  <th>الفني</th><th>الجوال</th><th>الخدمات</th><th>الحالة</th><th>الملاحظات</th><th>تاريخ الإضافة</th>
                </tr>
              </thead>
              <tbody>
                {technicians.map((technician) => {
                  const p = Array.isArray(technician.profile) ? technician.profile[0] : technician.profile;
                  return (
                    <tr key={technician.id}>
                      <td>{p?.full_name || "فني بدون اسم"}</td>
                      <td>{p?.phone || "—"}</td>
                      <td>{technician.service_types?.length ? technician.service_types.join(" · ") : "—"}</td>
                      <td><span className={`statusBadge ${technician.is_active ? "status-active" : "status-inactive"}`}>{technician.is_active ? "نشط" : "غير نشط"}</span></td>
                      <td className="descriptionCell">{technician.notes || "—"}</td>
                      <td>{new Date(technician.created_at).toLocaleString("ar-SA")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
