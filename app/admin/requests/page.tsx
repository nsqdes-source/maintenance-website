import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RequestStatusControl from "@/app/admin/RequestStatusControl";
import RequestTechnicianControl from "@/app/admin/RequestTechnicianControl";

export const dynamic = "force-dynamic";
const ADMIN_ROLES = new Set(["maintenance_manager", "admin_manager", "super_admin"]);
const STATUS_LABELS: Record<string, string> = { new: "جديد", contacted: "تم التواصل", scheduled: "مجدول", completed: "مكتمل", cancelled: "ملغي" };

type TechnicianOption = { id: string; name: string; serviceTypes: string[] };

export default async function AdminRequestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) redirect("/account");

  const [{ data: requests, error }, { data: technicians }, { data: assignments }] = await Promise.all([
    supabase.from("service_requests").select("id, customer_name, phone, service_type, problem_description, city, address, status, created_at").order("created_at", { ascending: false }),
    supabase.from("technicians").select("id, service_types, is_active, profile:profiles(full_name)").eq("is_active", true).order("created_at", { ascending: false }),
    supabase.from("service_request_assignments").select("service_request_id, technician_id, status, assigned_at").order("assigned_at", { ascending: false }),
  ]);

  const technicianOptions: TechnicianOption[] = (technicians ?? []).map((technician) => {
    const p = Array.isArray(technician.profile) ? technician.profile[0] : technician.profile;
    return { id: technician.id, name: p?.full_name || "فني بدون اسم", serviceTypes: technician.service_types ?? [] };
  });

  const currentAssignments = new Map<string, { technicianId: string; status: string }>();
  for (const assignment of assignments ?? []) {
    if (!currentAssignments.has(assignment.service_request_id) && ["pending", "accepted"].includes(assignment.status)) {
      currentAssignments.set(assignment.service_request_id, { technicianId: assignment.technician_id, status: assignment.status });
    }
  }
  const technicianNames = new Map(technicianOptions.map((item) => [item.id, item.name]));

  return <main className="adminPage"><div className="container adminContainer">
    <div className="adminTopbar"><div><p className="eyebrow">إدارة الطلبات</p><h1>طلبات الخدمة</h1></div><a className="button secondary" href="/admin">لوحة الإدارة</a></div>
    {error ? <div className="form-error">تعذر تحميل الطلبات.</div> : !requests?.length ? <div className="emptyState"><h2>لا توجد طلبات حتى الآن</h2><p>ستظهر طلبات العملاء هنا عند إرسالها من نموذج الموقع.</p></div> : <div className="adminTableWrap"><table className="adminTable"><thead><tr><th>العميل</th><th>الخدمة</th><th>المدينة</th><th>الجوال</th><th>الوصف</th><th>الفني المسند</th><th>الحالة</th><th>تاريخ الطلب</th></tr></thead><tbody>{requests.map((request) => { const assignment = currentAssignments.get(request.id); return <tr key={request.id}><td>{request.customer_name}</td><td>{request.service_type}</td><td>{request.city}</td><td><a href={`tel:${request.phone}`}>{request.phone}</a></td><td className="descriptionCell">{request.problem_description}<small>{request.address}</small></td><td><div className="assignmentCell">{assignment ? <span className="assignmentCurrent">{technicianNames.get(assignment.technicianId) ?? "فني مسند"} · {assignment.status === "accepted" ? "مقبول" : "قيد الانتظار"}</span> : <span className="assignmentCurrent empty">غير مسند</span>}<RequestTechnicianControl requestId={request.id} currentTechnicianId={assignment?.technicianId ?? null} technicians={technicianOptions.filter((t) => t.serviceTypes.includes(request.service_type) || t.serviceTypes.includes("خدمات أخرى")).length ? technicianOptions.filter((t) => t.serviceTypes.includes(request.service_type) || t.serviceTypes.includes("خدمات أخرى")) : technicianOptions} /></div></td><td><span className={`statusBadge status-${request.status}`}>{STATUS_LABELS[request.status] ?? request.status}</span><RequestStatusControl requestId={request.id} initialStatus={request.status} /></td><td>{new Date(request.created_at).toLocaleString("ar-SA")}</td></tr>; })}</tbody></table></div>}
  </div></main>;
}
