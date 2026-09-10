import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AssignmentResponseControl from "./AssignmentResponseControl";
import VisitOutcomeControl from "./VisitOutcomeControl";

export const dynamic = "force-dynamic";

const ASSIGNMENT_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  accepted: "مقبول",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

const WORKFLOW_LABELS: Record<string, string> = {
  awaiting_assignment: "بانتظار الإسناد",
  assigned: "تم إسناده",
  technician_accepted: "وافق الفني — الفني في الطريق",
  completed: "تم التنفيذ",
  needs_followup: "بحاجة إلى قطعة / تعديل",
  customer_rejected: "رفض العميل التنفيذ",
  customer_cancelled: "ألغاه العميل",
  cancelled: "ملغي",
};

export default async function TechnicianPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase.from("profiles").select("full_name, phone, role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || profile.role !== "technician") redirect("/account");

  const { data: technician, error: technicianError } = await supabase.from("technicians").select("id, service_types, is_active").eq("profile_id", user.id).maybeSingle();
  if (technicianError || !technician) {
    return <main className="adminPage"><div className="container adminContainer"><div className="form-error" role="alert">تعذر تحميل ملف الفني حاليًا.</div></div></main>;
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("service_request_assignments")
    .select("id, service_request_id, status, assigned_at, responded_at, notes, service_request:service_requests(customer_name, phone, service_type, problem_description, city, address, latitude, longitude, workflow_stage, visit_notes, created_at)")
    .eq("technician_id", technician.id)
    .order("assigned_at", { ascending: false });

  return (
    <main className="adminPage"><div className="container adminContainer">
      <div className="adminTopbar"><div><p className="eyebrow">لوحة الفني</p><h1>مرحبًا {profile.full_name || user.email}</h1></div></div>
      <div className="grid">
        <div className="card"><p className="serviceNumber">{technician.service_types?.length ?? 0}</p><h3>الخدمات</h3><p>{technician.service_types?.join(" · ") || "—"}</p></div>
        <div className="card"><p className="serviceNumber">{assignments?.filter((item) => ["pending", "accepted"].includes(item.status)).length ?? 0}</p><h3>الطلبات الحالية</h3><p>طلبات قيد المعالجة</p></div>
        <div className="card"><p className="serviceNumber">{technician.is_active ? "نشط" : "غير نشط"}</p><h3>حالة الفني</h3><p>حالة حساب الفني التشغيلية</p></div>
      </div>
      <section className="requestTableWrap">
        <div className="requestTableHeader"><span>{assignments?.length ?? 0} إسناد</span><span>الطلبات المسندة إليك فقط</span></div>
        {assignmentsError ? <div className="form-error" role="alert">تعذر تحميل الطلبات المسندة.</div> : !assignments?.length ? <div className="emptyState"><h2>لا توجد طلبات مسندة</h2><p>ستظهر الطلبات هنا عند إسنادها إليك من الإدارة.</p></div> : (
          <div className="requestList">{assignments.map((assignment) => {
            const request = Array.isArray(assignment.service_request) ? assignment.service_request[0] : assignment.service_request;
            const workflowStage = request?.workflow_stage || "";
            const canRecordOutcome = assignment.status === "accepted" && ["technician_accepted", "needs_followup"].includes(workflowStage);
            const hasCoordinates = typeof request?.latitude === "number" && typeof request?.longitude === "number" && (request.latitude !== 0 || request.longitude !== 0);
            const mapsUrl = hasCoordinates
              ? `https://www.google.com/maps/search/?api=1&query=${request.latitude},${request.longitude}`
              : null;
            return <article className="requestAdminCard" key={assignment.id}>
              <div className="requestAdminMain">
                <div className="requestAdminTitle"><h2>{request?.service_type || "طلب صيانة"}</h2><span className={`statusBadge assignment-${assignment.status}`}>{ASSIGNMENT_LABELS[assignment.status] ?? assignment.status}</span></div>
                <p className="requestMeta">{request?.customer_name || "العميل"} · {request?.city || "—"} · {request?.created_at ? new Date(request.created_at).toLocaleString("ar-SA") : "—"}</p>
                <p>{request?.problem_description || "—"}</p>
                {assignment.status === "pending" ? <AssignmentResponseControl assignmentId={assignment.id} /> : null}
                {canRecordOutcome ? <VisitOutcomeControl requestId={assignment.service_request_id} /> : null}
                {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noreferrer" className="mapLink">فتح الموقع في خرائط Google</a> : null}
                {assignment.notes ? <p className="requestMeta">ملاحظات الإسناد: {assignment.notes}</p> : null}
                {request?.visit_notes ? <p className="requestMeta">ملاحظات الزيارة: {request.visit_notes}</p> : null}
              </div>
              <div className="requestAdminDetails">
                <div><strong>الجوال</strong><span>{request?.phone || "—"}</span></div>
                <div><strong>العنوان</strong><span>{request?.address || "—"}</span></div>
                <div><strong>حالة الطلب</strong><span>{WORKFLOW_LABELS[workflowStage] ?? (workflowStage || "—")}</span></div>
                <div><strong>وقت الإسناد</strong><span>{new Date(assignment.assigned_at).toLocaleString("ar-SA")}</span></div>
              </div>
            </article>;
          })}</div>
        )}
      </section>
    </div></main>
  );
}
