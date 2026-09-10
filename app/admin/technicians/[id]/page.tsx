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
    supabase.from("technicians").select("id, profile_id, service_types, is_active, notes, created_at, updated_at, profile:profiles(full_name, phone)").eq("id", id).maybeSingle(),
    supabase.from("service_request_assignments").select("id, service_request_id, status, assigned_at, responded_at, notes, request:service_requests(customer_name, phone, service_type, city, workflow_stage, created_at)").eq("technician_id", id).order("assigned_at", { ascending: false }),
  ]);

  if (error || !technician) notFound();
  const p = Array.isArray(technician.profile) ? technician.profile[0] : technician.profile;
  const requestCount = assignments?.length ?? 0;
  const activeCount = (assignments ?? []).filter((item) => item.status === "pending" || item.status === "accepted").length;

  return <main className="adminPage"><div className="container adminContainer">
    <a className="backLink" href="/admin/technicians">← العودة إلى الفنيين</a>
    <div className="technicianDetailHeader"><div><p className="eyebrow">ملف الفني</p><h1>{p?.full_name || "فني بدون اسم"}</h1><p>تفاصيل بيانات الفني وسجل الطلبات المسندة إليه.</p></div><span className={`statusBadge ${technician.is_active ? "status-active" : "status-inactive"}`}>{technician.is_active ? "نشط" : "غير نشط"}</span></div>
    <section className="technicianDetailGrid">
      <article className="card"><h2>بيانات الفني</h2><div className="detailFacts"><div><span>الاسم</span><strong>{p?.full_name || "—"}</strong></div><div><span>الجوال</span><strong>{p?.phone || "—"}</strong></div><div><span>تاريخ الإضافة</span><strong>{new Date(technician.created_at).toLocaleString("ar-SA")}</strong></div><div><span>آخر تحديث</span><strong>{new Date(technician.updated_at).toLocaleString("ar-SA")}</strong></div></div></article>
      <article className="card"><h2>ملخص العمل</h2><div className="technicianStats"><div><strong>{requestCount}</strong><span>إجمالي الإسنادات</span></div><div><strong>{activeCount}</strong><span>الإسنادات النشطة</span></div></div><div className="technicianServices detailServices">{(technician.service_types ?? []).map((service) => <span key={service}>{service}</span>)}{!technician.service_types?.length ? <span>لا توجد خدمات محددة</span> : null}</div>{technician.notes ? <p className="technicianNotes">{technician.notes}</p> : null}</article>
    </section>
    <section className="card technicianEditSection"><div><h2>تعديل بيانات الفني</h2><p>يمكن للمشرف تحديث الخدمات والحالة والملاحظات.</p></div><TechnicianEditControl technicianId={technician.id} initialServices={technician.service_types ?? []} initialActive={technician.is_active} initialNotes={technician.notes} /></section>
    <section className="technicianAssignmentsSection"><div className="sectionHeading"><div><p className="eyebrow">سجل الإسناد</p><h2>الطلبات المسندة</h2></div><span className="statusBadge">{requestCount} طلب</span></div>{assignmentsError ? <div className="form-error">تعذر تحميل سجل الإسنادات.</div> : !assignments?.length ? <div className="emptyState"><h2>لا توجد إسنادات</h2><p>لم يتم إسناد طلبات لهذا الفني حتى الآن.</p></div> : <div className="technicianAssignmentList">{assignments.map((assignment) => { const request = Array.isArray(assignment.request) ? assignment.request[0] : assignment.request; return <article className="technicianAssignmentCard" key={assignment.id}><div className="assignmentCardMain"><div className="technicianNameRow"><h3>{request?.service_type || "طلب خدمة"}</h3><span className={`statusBadge status-${assignment.status}`}>{ASSIGNMENT_LABELS[assignment.status] ?? assignment.status}</span></div><p>{request?.customer_name || "عميل"} · {request?.city || "—"} · {request?.phone || "—"}</p><small>حالة الطلب: {WORKFLOW_LABELS[request?.workflow_stage ?? ""] ?? request?.workflow_stage ?? "—"}</small>{assignment.notes ? <small>ملاحظات الإسناد: {assignment.notes}</small> : null}</div><div className="assignmentCardMeta"><span>تاريخ الإسناد</span><strong>{new Date(assignment.assigned_at).toLocaleString("ar-SA")}</strong>{assignment.responded_at ? <><span>تاريخ الرد</span><strong>{new Date(assignment.responded_at).toLocaleString("ar-SA")}</strong></> : null}</div></article>; })}</div>}</section>
    <style>{`.technicianDetailHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:30px}.technicianDetailHeader h1{margin:0 0 10px;font-size:clamp(2rem,4vw,3rem)}.technicianDetailHeader p:not(.eyebrow){margin:0;color:#64748b;line-height:1.8}.technicianDetailGrid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.technicianDetailGrid .card{min-height:250px}.technicianDetailGrid h2,.technicianEditSection h2{margin:0 0 18px}.detailFacts{display:grid;grid-template-columns:1fr 1fr;gap:16px}.detailFacts strong{display:block;margin-top:5px;word-break:break-word}.technicianStats{display:grid;grid-template-columns:1fr 1fr;gap:12px}.technicianStats div{padding:18px;border-radius:14px;background:#f8fafc;text-align:center}.technicianStats strong{display:block;font-size:1.8rem}.technicianStats span{display:block;margin-top:4px;color:#64748b;font-size:.8rem}.detailServices{margin-top:18px}.technicianEditSection{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:18px}.technicianEditSection p{margin:0;color:#64748b}.technicianAssignmentsSection{margin-top:42px}.technicianAssignmentsSection .sectionHeading{margin-bottom:20px}.technicianAssignmentsSection .sectionHeading h2{margin:0}.technicianAssignmentList{display:grid;gap:12px}.technicianAssignmentCard{display:grid;grid-template-columns:1fr 220px;gap:20px;padding:20px;border:1px solid #e2e8f0;border-radius:16px;background:#fff}.assignmentCardMain p{margin:8px 0;color:#475569}.assignmentCardMain small{display:block;margin-top:5px;color:#64748b}.assignmentCardMeta{display:flex;flex-direction:column;gap:4px;padding-right:18px;border-right:1px solid #e2e8f0}.assignmentCardMeta strong{margin-bottom:8px;font-size:.9rem}.status-pending{background:#fef3c7;color:#92400e}.status-accepted{background:#dcfce7;color:#166534}.status-rejected{background:#fee2e2;color:#991b1b}.status-cancelled{background:#e2e8f0;color:#475569}@media(max-width:800px){.technicianDetailGrid,.technicianAssignmentCard{grid-template-columns:1fr}.technicianEditSection{align-items:stretch;flex-direction:column}.assignmentCardMeta{padding-right:0;padding-top:12px;border-right:0;border-top:1px solid #e2e8f0}}@media(max-width:520px){.detailFacts{grid-template-columns:1fr}.technicianDetailHeader{flex-direction:column}}`}</style>
  </div></main>;
}
