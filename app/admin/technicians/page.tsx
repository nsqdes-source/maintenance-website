import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AddTechnicianForm from "@/app/admin/AddTechnicianForm";
import TechnicianEditControl from "@/app/admin/TechnicianEditControl";

export const dynamic = "force-dynamic";
const ADMIN_ROLES = new Set(["maintenance_manager", "admin_manager", "super_admin"]);

type ProfileOption = { id: string; full_name: string | null; phone: string | null; role: string };

export default async function AdminTechniciansPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) redirect("/account");

  const [{ data: technicians, error }, { data: technicianLinks }, { data: profiles, error: profilesError }, { data: assignments }] = await Promise.all([
    supabase.from("technicians").select("id, profile_id, service_types, is_active, notes, created_at, profile:profiles(full_name, phone)").order("created_at", { ascending: false }),
    supabase.from("technicians").select("profile_id"),
    supabase.from("profiles").select("id, full_name, phone, role").in("role", ["customer", "technician"]).order("created_at", { ascending: false }),
    supabase.from("service_request_assignments").select("technician_id, status").in("status", ["pending", "accepted"]),
  ]);

  const existingTechnicianIds = new Set((technicianLinks ?? []).map((item) => item.profile_id));
  const availableUsers: ProfileOption[] = (profiles ?? []).filter((item) => !existingTechnicianIds.has(item.id));
  const assignmentCounts = new Map<string, number>();
  for (const assignment of assignments ?? []) assignmentCounts.set(assignment.technician_id, (assignmentCounts.get(assignment.technician_id) ?? 0) + 1);

  return (
    <main className="adminPage"><div className="container adminContainer">
      <div className="adminTopbar">
        <div><p className="eyebrow">إدارة الفنيين</p><h1>الفنيون</h1></div>
        <a className="button secondary" href="/admin">لوحة الإدارة</a>
      </div>

      <AddTechnicianForm users={availableUsers} />
      {profilesError ? <div className="form-error">تعذر تحميل قائمة المستخدمين لإضافة الفني.</div> : null}

      {error ? <div className="form-error">تعذر تحميل الفنيين.</div> : !technicians?.length ? (
        <div className="emptyState"><h2>لا يوجد فنيون حتى الآن</h2><p>أضف فنيًا من مستخدم مسجل، وستظهر بياناته هنا.</p></div>
      ) : (
        <div className="technicianCardGrid">
          {technicians.map((technician) => {
            const p = Array.isArray(technician.profile) ? technician.profile[0] : technician.profile;
            const name = p?.full_name || "فني بدون اسم";
            const activeAssignments = assignmentCounts.get(technician.id) ?? 0;
            return (
              <article className="technicianCard" key={technician.id}>
                <div className="technicianCardHeader">
                  <div className="technicianAvatar" aria-hidden="true">{name.trim().charAt(0) || "ف"}</div>
                  <div className="technicianCardIdentity">
                    <div className="technicianNameRow">
                      <h2>{name}</h2>
                      <span className={`statusBadge ${technician.is_active ? "status-active" : "status-inactive"}`}>{technician.is_active ? "نشط" : "غير نشط"}</span>
                    </div>
                    <a href={`/admin/technicians/${technician.id}`} className="technicianDetailsLink">عرض تفاصيل الفني ←</a>
                  </div>
                </div>
                <div className="technicianCardMeta">
                  <div><span>الجوال</span><strong>{p?.phone || "—"}</strong></div>
                  <div><span>الطلبات النشطة</span><strong>{activeAssignments}</strong></div>
                </div>
                <div className="technicianServices">
                  {technician.service_types?.length ? technician.service_types.map((service) => <span key={service}>{service}</span>) : <span>لا توجد خدمات محددة</span>}
                </div>
                {technician.notes ? <p className="technicianNotes">{technician.notes}</p> : null}
                <div className="technicianCardActions">
                  <a className="button secondary compactButton" href={`/admin/technicians/${technician.id}`}>التفاصيل</a>
                  <TechnicianEditControl technicianId={technician.id} initialServices={technician.service_types ?? []} initialActive={technician.is_active} initialNotes={technician.notes} />
                </div>
              </article>
            );
          })}
        </div>
      )}
      <style>{`\n        .technicianCardGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}\n        .technicianCard{padding:22px;border:1px solid #e2e8f0;border-radius:18px;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.04)}\n        .technicianCardHeader{display:flex;align-items:flex-start;gap:14px}\n        .technicianAvatar{width:48px;height:48px;flex:0 0 48px;display:grid;place-items:center;border-radius:14px;background:#0f172a;color:#fff;font-size:1.15rem;font-weight:800}\n        .technicianCardIdentity{min-width:0;flex:1}.technicianNameRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.technicianNameRow h2{margin:0;font-size:1.1rem}.technicianDetailsLink{display:inline-block;margin-top:7px;color:#475569;font-size:.85rem;font-weight:700}.technicianCardMeta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}.technicianCardMeta div{padding:12px;border-radius:12px;background:#f8fafc}.technicianCardMeta span,.detailFacts span,.assignmentCardMeta span{display:block;color:#64748b;font-size:.78rem}.technicianCardMeta strong{display:block;margin-top:4px}.technicianServices{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}.technicianServices span{padding:5px 9px;border:1px solid #e2e8f0;border-radius:999px;color:#475569;font-size:.78rem}.technicianNotes{margin:14px 0 0;color:#64748b;line-height:1.7;font-size:.9rem}.technicianCardActions{display:flex;align-items:center;gap:8px;margin-top:18px}.compactButton{min-height:40px;padding-inline:14px;font-size:.85rem}.technicianCardActions .technicianEditControl{flex:1}.technicianCardActions .technicianEditControl>button{width:100%}\n        @media (max-width:900px){.technicianCardGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}\n        @media (max-width:620px){.technicianCardGrid{grid-template-columns:1fr}}\n      `}</style>
    </div></main>
  );
}
