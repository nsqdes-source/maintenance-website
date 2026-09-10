import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TechnicianEditControl from "@/app/admin/TechnicianEditControl";

export const dynamic = "force-dynamic";
const ADMIN_ROLES = new Set(["maintenance_manager", "admin_manager", "super_admin"]);
const ASSIGNMENT_LABELS: Record<string, string> = { pending: "قيد الانتظار", accepted: "مقبول", rejected: "مرفوض", cancelled: "ملغي" };
const WORKFLOW_LABELS: Record<string, string> = { awaiting_assignment: "بانتظار الإسناد", assigned: "تم إسناده", technician_accepted: "وافق الفني", completed: "تم التنفيذ", needs_followup: "بحاجة إلى قطعة / تعديل", customer_rejected: "العميل رفض الإصلاح", cancelled: "ملغي" };

type PageProps = { params: Promise<{ id: string }> };

export default async function TechnicianDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) redirect("/account");

  const [{ data: technician, error }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase.from("technicians").select("id, profile_id, service_types, is_active, notes, created_at, updated_at, profile:profiles(full_name, phone, email)").eq("id", id).maybeSingle(),
    supabase.from("service_request_assignments").select("id, service_request_id, status, assigned_at, responded_at, notes, request:service_requests(customer_name, phone, service_type, city, workflow_stage, created_at)").eq("technician_id", id).order("assigned_at", { ascending: false }),
  ]);

  if (error || !technician) notFound();
  const p = Array.isArray(technician.profile) ? technician.profile[0] : technician.profile;
  const requestCount = assignments?.length ?? 0;
  const activeCount = (assignments ?? []).filter((item) => item.status === "pending" || item.status === "accepted").length;

  return <main className="adminPage"><div className="container adminContainer">
    <a className="backLink" href="/admin/technicians">← العودة إلى الفنيين</a>
    <div className="technicianDetailHeader">
      <div><p className="eyebrow">ملف الفني</p><h1>{p?.full_name || "فني بدون اسم"}</h1><p>تفاصيل بيانات الفني وسجل الطلبات المسندة إليه.</p></div>
      <span className={`statusBadge ${technician.is_active ? "status-active" : "status-inactive"}`}>{technician.is_active ? "نشط" : "غير نشط"}</span>
    </div>

    <section className="technicianDetailGrid">
      <article className="card">
        <h2>بيانات الفني</h2>
        <div className="detailFacts">
          <div><span>الاسم</span><strong>{p?.full_name || "—"}</strong></div>
          <div><span>الجوال</span><strong>{p?.phone || "—"}</strong></div>
          <div><span>البريد الإلكتروني</span><strong>{p?.email || "—"}</strong></div>
          <div><span>تاريخ الإضافة</span><strong>{new Date(technician.created_at).toLocaleString("ar-SA")}</strong></div>
          <div><span>آخر تحديث</span><strong>{new Date(technician.updated_at).toLocaleString("ar-SA")}</strong></div>
        </div>
      </article>
      <article className="card">
        <h2>ملخص العمل</h2>
        <div className="technicianStats">
          <div><strong>{requestCount}</strong><span>إجمالي الإسنادات</span></div>
          <div><strong>{activeCount}</strong><span>الإسنادات النشطة</span></div>
        </div>
        <div className="technicianServices detailServices">
          {(technician.service_types ?? []).map((service) => <span key={service}>{service}</span>)}
          {!technician.service_types?.length ? <span>لا توجد خدمات محددة</span> : null}
        </div>
        {technician.notes ? <p className="technicianNotes">{technician.notes}</p> : null}
      </article>
    </section>

    <section className="card technicianEditSection">
      <div><h2>تعديل بيانات الفني</h2><p>يمكن للمشرف تحديث الخدمات والحالة والملاحظات.</p></div>
      <TechnicianEditControl technicianId={technician.id} initialServices={technician.service_types ?? []} initialActive={technician.is_active} initialNotes={technician.notes} />
    </section>

    <section className="technicianAssignmentsSection">
      <div className="sectionHeading"><div><p className="eyebrow">سجل الإسناد</p><h2>الطلبات المسندة</h2></div><span className="statusBadge">{requestCount} طلب</span></div>
      {assignmentsError ? <div className="form-error">تعذر تحميل سجل الإسنادات.</div> : !assignments?.length ? <div className="emptyState"><h2>لا توجد إسنادات</h2><p>لم يتم إسناد طلبات لهذا الفني حتى الآن.</p></div> : (
        <div className="technicianAssignmentList">
          {assignments.map((assignment) => {
            const request = Array.isArray(assignment.request) ? assignment.request[0] : assignment.request;
            return <article className="technicianAssignmentCard" key={assignment.id}>
              <div className="assignmentCardMain">
                <div className="technicianNameRow"><h3>{request?.service_type || "طلب خدمة"}</h3><span className={`statusBadge status-${assignment.status}`}>{ASSIGNMENT_LABELS[assignment.status] ?? assignment.status}</span></div>
                <p>{request?.customer_name || "عميل"} · {request?.city || "—"} · {request?.phone || "—"}</p>
                <small>حالة الطلب: {WORKFLOW_LABELS[request?.workflow_stage ?? ""] ?? request?.workflow_stage ?? "—"}</small>
                {assignment.notes ? <small>ملاحظات الإسناد: {assignment.notes}</small> : null}
              </div>
              <div className="assignmentCardMeta"><span>تاريخ الإسناد</span><strong>{new Date(assignment.assigned_at).toLocaleString("ar-SA")}</strong>{assignment.responded_at ? <><span>تاريخ الرد</span><strong>{new Date(assignment.responded_at).toLocaleString("ar-SA")}</strong></> : null}</div>
            </article>;
          })}
        </div>
      )}
    </section>
  </div></main>;
}
