import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AssignmentResponseControl from "./AssignmentResponseControl";
import VisitOutcomeControl from "./VisitOutcomeControl";
import RequestImages from "@/app/components/RequestImages";
import { getLocale, text } from "@/lib/locale";
import { TECHNICIAN_DASHBOARD_CARDS, dashboardCardStyle, normalizeDashboardCards } from "@/lib/dashboard-display";

export const dynamic = "force-dynamic";

const STAGES: Record<string, string> = {
  awaiting_assignment: "بانتظار الإسناد", assigned: "تم الإسناد",
  technician_accepted: "تم قبول الإسناد — جارٍ تأكيد الموعد", in_progress: "قيد التنفيذ",
  awaiting_completion_review: "بانتظار مراجعة الإدارة", reschedule_requested: "طلب إعادة جدولة", unable_to_complete: "تعذر التنفيذ",
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

const STAGES_EN: Record<string, string> = { awaiting_assignment: "Awaiting assignment", assigned: "Assigned", technician_accepted: "Assignment accepted — appointment being confirmed", in_progress: "In progress", awaiting_completion_review: "Awaiting admin review", reschedule_requested: "Rescheduling requested", unable_to_complete: "Unable to complete", completed: "Completed", needs_followup: "Parts or follow-up needed", awaiting_admin_quote: "Awaiting quote", awaiting_customer_approval: "Awaiting customer approval", quote_approved: "Quote approved", customer_rejected: "Customer declined", customer_cancelled: "Customer cancelled", cancelled: "Cancelled" };
const ASSIGNMENTS_EN: Record<string, string> = { pending: "Awaiting response", accepted: "Accepted", completed: "Completed", rejected: "Declined", cancelled: "Cancelled" };
export default async function TechnicianPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => text(locale, ar, en);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "technician") redirect("/account");
  const { data: technician } = await supabase.from("technicians").select("id, service_types, is_active").eq("profile_id", user.id).maybeSingle();
  if (!technician) return <main className="adminPage"><div className="container adminContainer"><div className="form-error">{t("تعذر تحميل ملف الفني.", "Could not load the technician profile.")}</div></div></main>;
  const [{ data: dashboardDisplay }, { data: assignments, error }] = await Promise.all([
    supabase.from("dashboard_display_settings").select("technician_cards").eq("id", true).maybeSingle(),
    supabase.from("service_request_assignments")
    .select("id, service_request_id, status, assigned_at, responded_at, notes, service_request:service_requests(customer_name, phone, service_type, problem_description, city, address, latitude, longitude, workflow_stage, visit_notes, created_at)")
    .eq("technician_id", technician.id).order("assigned_at", { ascending: false }),
  ]);

  const dashboardCards = normalizeDashboardCards(dashboardDisplay?.technician_cards, TECHNICIAN_DASHBOARD_CARDS);
  const current = assignments?.filter(a => ["pending", "accepted"].includes(a.status)).length ?? 0;
  const completed = assignments?.filter(a => a.status === "completed").length ?? 0;
  const declined = assignments?.filter(a => a.status === "rejected").length ?? 0;

  return <main className="adminPage techPortal"><div className="container adminContainer">
    <div className="adminTopbar"><div><p className="eyebrow">{t("لوحة الفني", "Technician dashboard")}</p><h1>{t("مرحبًا", "Welcome,")} {profile.full_name || user.email}</h1></div></div>
    <div className="grid dashboardDisplayCard" style={dashboardCardStyle(dashboardCards, "summary")}>
      <div className="card"><p className="serviceNumber">{current}</p><h3>{t("الطلبات الحالية", "Current requests")}</h3></div>
      <div className="card"><p className="serviceNumber">{completed}</p><h3>{t("الطلبات المنفذة", "Completed requests")}</h3></div>
      <div className="card"><p className="serviceNumber">{declined}</p><h3>{t("الإسنادات المرفوضة", "Declined assignments")}</h3></div>
      <div className="card"><p className="serviceNumber">{technician.is_active ? "نشط" : "غير نشط"}</p><h3>{t("حالة الفني", "Technician status")}</h3></div>
    </div>
    <section className="adminTableWrap dashboardDisplayCard" style={dashboardCardStyle(dashboardCards, "assignments")}>
      <div className="requestTableHeader"><span>{assignments?.length ?? 0} {t("إسناد", "assignments")}</span><span>{t("الخدمات:", "Services:")} {technician.service_types?.join(" · ") || "—"}</span></div>
      {error ? <div className="form-error" role="alert">{t("تعذر تحميل الطلبات.", "Could not load requests.")}</div> : !assignments?.length ? <div className="emptyState"><h2>{t("لا توجد طلبات مسندة", "No assigned requests")}</h2></div> :
      <table className="adminTable"><thead><tr><th>{t("الطلب والعميل", "Request and customer")}</th><th>{t("الموقع والتواصل", "Location and contact")}</th><th>{t("حالة الطلب", "Request status")}</th><th>{t("الإسناد", "Assignment")}</th><th>{t("الإجراء", "Action")}</th><th>{t("التاريخ", "Date")}</th></tr></thead><tbody>
        {assignments.map(assignment => {
          const request = Array.isArray(assignment.service_request) ? assignment.service_request[0] : assignment.service_request;
          const stage = request?.workflow_stage || "";
          const coordinates = typeof request?.latitude === "number" && typeof request?.longitude === "number";
          const mapUrl = coordinates ? `https://www.google.com/maps/search/?api=1&query=${request.latitude},${request.longitude}` : null;
          const canRecord = assignment.status === "accepted" && stage === "in_progress";
          return <tr id={`request-${assignment.service_request_id}`} key={assignment.id}>
            <td><strong>{request?.service_type || "طلب صيانة"}</strong><small>{request?.customer_name || "—"}</small><small>{request?.problem_description || "—"}</small><RequestImages requestId={assignment.service_request_id} /></td>
            <td><span>{request?.city || "—"}، {request?.address || "—"}</span><small><a href={`tel:${request?.phone || ""}`}>{request?.phone || "—"}</a></small>{mapUrl ? <small><a href={mapUrl} target="_blank" rel="noreferrer">{t("فتح Google Maps", "Open Google Maps")}</a></small> : null}</td>
            <td><span className={`statusBadge status-${stage}`}>{(locale === "ar" ? STAGES : STAGES_EN)[stage] || stage}</span>{request?.visit_notes ? <small>{request.visit_notes}</small> : null}</td>
            <td><span className={`statusBadge assignment-${assignment.status}`}>{(locale === "ar" ? ASSIGNMENTS : ASSIGNMENTS_EN)[assignment.status] || assignment.status}</span>{assignment.notes ? <small>{assignment.notes}</small> : null}</td>
            <td>{assignment.status === "pending" ? <AssignmentResponseControl assignmentId={assignment.id} /> : canRecord ? <VisitOutcomeControl requestId={assignment.service_request_id} /> : "—"}</td>
            <td>{new Date(assignment.assigned_at).toLocaleString(locale === "ar" ? "ar-SA" : "en-US")}</td>
          </tr>;
        })}
      </tbody></table>}
    </section>
  </div></main>;
}
