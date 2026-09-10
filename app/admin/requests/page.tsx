import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RequestTechnicianControl from "@/app/admin/RequestTechnicianControl";

export const dynamic = "force-dynamic";
const ADMIN_ROLES = new Set(["maintenance_manager", "admin_manager", "super_admin"]);

const WORKFLOW_LABELS: Record<string, string> = {
  awaiting_assignment: "بانتظار الإسناد",
  assigned: "تم إسناده",
  technician_accepted: "وافق الفني",
  completed: "تم التنفيذ",
  needs_followup: "بحاجة إلى قطعة / تعديل",
  customer_rejected: "العميل رفض الإصلاح",
  customer_cancelled: "ألغاه العميل",
  cancelled: "ملغي",
};

const FILTER_STATUSES = Object.entries(WORKFLOW_LABELS);

type TechnicianOption = { id: string; name: string; phone: string | null; serviceTypes: string[] };
type SearchParams = { status?: string; from?: string; to?: string };

export default async function AdminRequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) redirect("/account");

  const filters = await searchParams;
  const status = filters.status && Object.prototype.hasOwnProperty.call(WORKFLOW_LABELS, filters.status) ? filters.status : "";
  const from = filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from) ? filters.from : "";
  const to = filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to) ? filters.to : "";

  let requestsQuery = supabase
    .from("service_requests")
    .select("id, customer_name, phone, service_type, problem_description, city, address, workflow_stage, visit_notes, created_at")
    .order("created_at", { ascending: false });

  if (status) requestsQuery = requestsQuery.eq("workflow_stage", status);
  if (from) requestsQuery = requestsQuery.gte("created_at", `${from}T00:00:00+03:00`);
  if (to) {
    const nextDay = new Date(`${to}T00:00:00+03:00`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    requestsQuery = requestsQuery.lt("created_at", nextDay.toISOString());
  }

  const [{ data: requests, error }, { data: technicians }, { data: assignments }] = await Promise.all([
    requestsQuery,
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
    <form className="card" method="get" aria-label="تصفية الطلبات">
      <div className="requestAdminDetails">
        <div><label htmlFor="status">الحالة</label><select id="status" name="status" defaultValue={status}><option value="">كل الحالات</option>{FILTER_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div><label htmlFor="from">من تاريخ</label><input id="from" name="from" type="date" defaultValue={from} /></div>
        <div><label htmlFor="to">إلى تاريخ</label><input id="to" name="to" type="date" defaultValue={to} /></div>
      </div>
      <div className="filterActions"><button className="button" type="submit">تطبيق التصفية</button><a className="button secondary" href="/admin/requests">مسح التصفية</a></div>
    </form>
    {error ? <div className="form-error">تعذر تحميل الطلبات.</div> : !requests?.length ? <div className="emptyState"><h2>لا توجد طلبات مطابقة</h2><p>جرّب تغيير الحالة أو نطاق التاريخ.</p></div> : <div className="adminTableWrap"><div className="requestTableHeader"><span>{requests.length} طلب</span><span>نتائج التصفية الحالية</span></div><table className="adminTable"><thead><tr><th>العميل</th><th>الخدمة</th><th>المدينة</th><th>الجوال</th><th>الوصف</th><th>الحالة</th><th>الفني المسند</th><th>تاريخ الطلب</th></tr></thead><tbody>{requests.map((request) => { const assignment = activeAssignmentByRequest.get(request.id); const assignedTech = assignment ? technicianOptions.find((item) => item.id === assignment.technicianId) : null; return <tr key={request.id}><td><a className="requestDetailsLink" href={`/admin/requests/${request.id}`}>{request.customer_name}</a></td><td>{request.service_type}</td><td>{request.city}</td><td><a href={`tel:${request.phone}`}>{request.phone}</a></td><td className="descriptionCell">{request.problem_description}<small>{request.address}</small>{request.visit_notes ? <small>ملاحظات الزيارة: {request.visit_notes}</small> : null}</td><td><a href={`/admin/requests/${request.id}`}><span className={`statusBadge status-${request.workflow_stage}`}>{WORKFLOW_LABELS[request.workflow_stage] ?? request.workflow_stage}</span></a></td><td><RequestTechnicianControl requestId={request.id} serviceType={request.service_type} technicians={technicianOptions} currentTechnicianId={assignedTech?.id ?? null} />{assignedTech ? <small className="assignmentHint">{assignedTech.name} · {assignment?.status === "accepted" ? "مقبول" : "قيد الانتظار"}</small> : null}</td><td>{new Date(request.created_at).toLocaleString("ar-SA")}</td></tr>; })}</tbody></table></div>}
    <style>{`.requestDetailsLink { color: inherit; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }`}</style>
  </div></main>;
}
