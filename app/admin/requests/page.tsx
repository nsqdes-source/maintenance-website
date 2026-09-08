import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RequestStatusControl from "@/app/admin/RequestStatusControl";
import RequestTechnicianControl from "@/app/admin/RequestTechnicianControl";

export const dynamic = "force-dynamic";
const ADMIN_ROLES = new Set(["maintenance_manager", "admin_manager", "super_admin"]);
const STATUS_LABELS: Record<string, string> = { new: "جديد", contacted: "تم التواصل", scheduled: "مجدول", completed: "مكتمل", cancelled: "ملغي" };

type TechnicianOption = { id: string; name: string; phone: string | null; serviceTypes: string[] };

export default async function AdminRequestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) redirect("/account");

  const [{ data: requests, error }, { data: technicians }, { data: assignments }] = await Promise.all([
    supabase.from("service_requests").select("id, customer_name, phone, service_type, problem_description, city, address, status, created_at").order("created_at", { ascending: false }),
    supabase.from("technicians").select("id, profile_id, service_types, is_active, profile:profiles(full_name, phone)").eq("is_active", true),
    supabase.from("service_request_assignments").select("service_request_id, technician_id, status, assigned_at").in("status", ["pending", "accepted"]),
  ]);

  const technicianOptions: TechnicianOption[] = (technicians ?? []).map((technician) => {
    const profileData = Array.isArray(technician.profile) ? technician.profile[0] : technician.profile;
    return { id: technician.id, name: profileData?.full_name || "فني بدون اسم", phone: profileData?.phone ?? null, serviceTypes: technician.service_types ?? [] };
  });

  const activeAssignmentByRequest = new Map<string, { technicianId: string; status: string }>();
  for (const assignment of assignments ?? []) {
    activeAssignmentByRequest.set(assignment.service_request_id, { technicianId: assignment.technician_id, status: assignment.status });
  }

  return <main className="adminPage"><div className="container adminContainer">
    <div className="adminTopbar"><div><p className="eyebrow">إدارة الطلبات</p><h1>طلبات الخدمة</h1></div><a className="button secondary" href="/admin">لوحة الإدارة</a></div>
    {error ? <div className="form-error">تعذر تحميل الطلبات.</div> : !requests?.length ? <div className="emptyState"><h2>لا توجد طلبات حتى الآن</h2><p>ستظهر طلبات العملاء هنا عند إرسالها من نموذج الموقع.</p></div> : <div className="adminTableWrap"><table className="adminTable"><thead><tr><th>العميل</th><th>الخدمة</th><th>المدينة</th><th>الجوال</th><th>الوصف</th><th>الحالة</th><th>الفني المسند</th><th>تاريخ الطلب</th></tr></thead><tbody>{requests.map((request) => { const assignment = activeAssignmentByRequest.get(request.id); const assignedTech = assignment ? technicianOptions.find((item) => item.id === assignment.technicianId) : null; return <tr key={request.id}><td>{request.customer_name}</td><td>{request.service_type}</td><td>{request.city}</td><td><a href={`tel:${request.phone}`}>{request.phone}</a></td><td className="descriptionCell">{request.problem_description}<small>{request.address}</small></td><td><span className={`statusBadge status-${request.status}`}>{STATUS_LABELS[request.status] ?? request.status}</span><RequestStatusControl requestId={request.id} initialStatus={request.status} /></td><td><RequestTechnicianControl requestId={request.id} serviceType={request.service_type} technicians={technicianOptions} currentTechnicianId={assignedTech?.id ?? null} />{assignedTech ? <small className="assignmentHint">{assignedTech.name} · {assignment?.status === "accepted" ? "مقبول" : "قيد الانتظار"}</small> : null}</td><td>{new Date(request.created_at).toLocaleString("ar-SA")}</td></tr>; })}</tbody></table></div>}
  </div></main>;
}
