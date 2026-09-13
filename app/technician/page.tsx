import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AssignmentResponseControl from "./AssignmentResponseControl";
import VisitOutcomeControl from "./VisitOutcomeControl";
import RequestImages from "@/app/components/RequestImages";

export const dynamic = "force-dynamic";

const STAGES: Record<string, string> = {
  awaiting_assignment: "بانتظار الإسناد", assigned: "تم الإسناد",
  technician_accepted: "وافق الفني", in_progress: "قيد التنفيذ",
  completed: "تم التنفيذ", needs_followup: "بحاجة إلى متابعة",
  awaiting_admin_quote: "بانتظار عرض الإصلاح",
  awaiting_customer_approval: "بانتظار موافقة العميل",
  quote_approved: "وافق العميل", customer_rejected: "رفض العميل",
  customer_cancelled: "ألغاه العميل", cancelled: "ملغي",
};
const ASSIGNMENTS: Record<string, string> = {
  pending: "بانتظار الرد", accepted: "مقبول", completed: "مكتمل",
  rejected: "مرفوض", cancelled: "ملغي",
};

export default async function TechnicianPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "technician") redirect("/account");
  const { data: technician } = await supabase.from("technicians").select("id, service_types, is_active").eq("profile_id", user.id).maybeSingle();
  if (!technician) return <main className="adminPage"><div className="container adminContainer"><div className="form-error">تعذر تحميل ملف الفني.</div></div></main>;
  const { data: assignments, error } = await supabase.from("service_request_assignments")
    .select("id, service_request_id, status, assigned_at, responded_at, notes, service_request:service_requests(customer_name, phone, service_type, problem_description, city, address, latitude, longitude, workflow_stage, visit_notes, created_at)")
    .eq("technician_id", technician.id).order("assigned_at", { ascending: false });

  const current = assignments?.filter(a => ["pending", "accepted"].includes(a.status)).length ?? 0;
  const completed = assignments?.filter(a => a.status === "completed").length ?? 0;
  const declined = assignments?.filter(a => a.status === "rejected").length ?? 0;

  return <main className="adminPage"><div className="container adminContainer">
    <div className="adminTopbar"><div><p className="eyebrow">لوحة الفني</p><h1>مرحبًا {profile.full_name || user.email}</h1></div></div>
    <div className="grid">
      <div className="card"><p className="serviceNumber">{current}</p><h3>الطلبات الحالية</h3></div>
      <div className="card"><p className="serviceNumber">{completed}</p><h3>الطلبات المنفذة</h3></div>
      <div className="card"><p className="serviceNumber">{declined}</p><h3>الإسنادات المرفوضة</h3></div>
      <div className="card"><p className="serviceNumber">{technician.is_active ? "نشط" : "غير نشط"}</p><h3>حالة الفني</h3></div>
    </div>
    <section className="adminTableWrap">
      <div className="requestTableHeader"><span>{assignments?.length ?? 0} إسناد</span><span>الخدمات: {technician.service_types?.join(" · ") || "—"}</span></div>
      {error ? <div className="form-error" role="alert">تعذر تحميل الطلبات.</div> : !assignments?.length ? <div className="emptyState"><h2>لا توجد طلبات مسندة</h2></div> :
      <table className="adminTable"><thead><tr><th>الطلب والعميل</th><th>الموقع والتواصل</th><th>حالة الطلب</th><th>الإسناد</th><th>الإجراء</th><th>التاريخ</th></tr></thead><tbody>
        {assignments.map(assignment => {
          const request = Array.isArray(assignment.service_request) ? assignment.service_request[0] : assignment.service_request;
          const stage = request?.workflow_stage || "";
          const coordinates = typeof request?.latitude === "number" && typeof request?.longitude === "number";
          const mapUrl = coordinates ? `https://www.google.com/maps/search/?api=1&query=${request.latitude},${request.longitude}` : null;
          const canRecord = assignment.status === "accepted" && stage === "in_progress";
          return <tr key={assignment.id}>
            <td><strong>{request?.service_type || "طلب صيانة"}</strong><small>{request?.customer_name || "—"}</small><small>{request?.problem_description || "—"}</small><RequestImages requestId={assignment.service_request_id} /></td>
            <td><span>{request?.city || "—"}، {request?.address || "—"}</span><small><a href={`tel:${request?.phone || ""}`}>{request?.phone || "—"}</a></small>{mapUrl ? <small><a href={mapUrl} target="_blank" rel="noreferrer">فتح Google Maps</a></small> : null}</td>
            <td><span className={`statusBadge status-${stage}`}>{STAGES[stage] || stage}</span>{request?.visit_notes ? <small>{request.visit_notes}</small> : null}</td>
            <td><span className={`statusBadge assignment-${assignment.status}`}>{ASSIGNMENTS[assignment.status] || assignment.status}</span>{assignment.notes ? <small>{assignment.notes}</small> : null}</td>
            <td>{assignment.status === "pending" ? <AssignmentResponseControl assignmentId={assignment.id} /> : canRecord ? <VisitOutcomeControl requestId={assignment.service_request_id} /> : "—"}</td>
            <td>{new Date(assignment.assigned_at).toLocaleString("ar-SA")}</td>
          </tr>;
        })}
      </tbody></table>}
    </section>
  </div></main>;
}
