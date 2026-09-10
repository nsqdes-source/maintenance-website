import { notFound, redirect } from "next/navigation";
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
  cancelled: "ملغي",
};

const ASSIGNMENT_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  accepted: "مقبول",
  declined: "مرفوض",
  cancelled: "ملغي",
};

type PageProps = { params: Promise<{ id: string }> };
type TechnicianOption = { id: string; name: string; phone: string | null; serviceTypes: string[] };

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-SA");
}

export default async function AdminRequestDetailsPage({ params }: PageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) redirect("/account");

  const { id } = await params;
  const [{ data: request, error: requestError }, { data: technicians }, { data: assignments }] = await Promise.all([
    supabase
      .from("service_requests")
      .select("id, customer_name, phone, customer_email, service_type, problem_description, city, address, latitude, longitude, status, workflow_stage, visit_outcome, visit_notes, created_at, workflow_updated_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("technicians")
      .select("id, profile_id, service_types, is_active, profile:profiles(full_name, phone)")
      .eq("is_active", true),
    supabase
      .from("service_request_assignments")
      .select("id, technician_id, status, assigned_at, responded_at, notes")
      .eq("service_request_id", id)
      .order("assigned_at", { ascending: false }),
  ]);

  if (requestError || !request) notFound();

  const technicianOptions: TechnicianOption[] = (technicians ?? []).map((technician) => {
    const profileData = Array.isArray(technician.profile) ? technician.profile[0] : technician.profile;
    return {
      id: technician.id,
      name: profileData?.full_name || "فني بدون اسم",
      phone: profileData?.phone ?? null,
      serviceTypes: technician.service_types ?? [],
    };
  });

  const activeAssignment = (assignments ?? []).find((assignment) => assignment.status === "pending" || assignment.status === "accepted");
  const assignedTechnician = activeAssignment
    ? technicianOptions.find((technician) => technician.id === activeAssignment.technician_id)
    : null;

  const hasLocation = Number.isFinite(request.latitude) && Number.isFinite(request.longitude);
  const mapUrl = hasLocation
    ? `https://www.google.com/maps?q=${request.latitude},${request.longitude}`
    : null;

  return (
    <main className="adminPage">
      <div className="container adminContainer requestDetailPage">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">تفاصيل طلب الخدمة</p>
            <h1>طلب {request.id.slice(0, 8)}</h1>
          </div>
          <a className="button secondary" href="/admin/requests">العودة للطلبات</a>
        </div>

        <section className="requestDetailGrid">
          <article className="card detailCard">
            <div className="detailCardHeader">
              <div>
                <p className="eyebrow">الحالة الحالية</p>
                <span className={`statusBadge status-${request.workflow_stage}`}>
                  {WORKFLOW_LABELS[request.workflow_stage] ?? request.workflow_stage}
                </span>
              </div>
              <div className="detailDates">
                <span>تاريخ الطلب</span>
                <strong>{formatDate(request.created_at)}</strong>
              </div>
            </div>

            <h2>بيانات العميل</h2>
            <div className="detailFields">
              <div><span>الاسم</span><strong>{request.customer_name}</strong></div>
              <div><span>الجوال</span><a href={`tel:${request.phone}`}>{request.phone}</a></div>
              <div><span>البريد الإلكتروني</span><a href={`mailto:${request.customer_email}`}>{request.customer_email || "—"}</a></div>
              <div><span>المدينة</span><strong>{request.city}</strong></div>
            </div>

            <h2>تفاصيل الخدمة</h2>
            <div className="detailFields">
              <div><span>نوع الخدمة</span><strong>{request.service_type}</strong></div>
              <div className="detailWide"><span>العنوان</span><strong>{request.address}</strong></div>
              <div className="detailWide"><span>وصف المشكلة</span><p>{request.problem_description}</p></div>
            </div>

            <h2>الموقع</h2>
            {hasLocation ? (
              <div className="locationSummary">
                <div><span>خط العرض</span><strong>{request.latitude}</strong></div>
                <div><span>خط الطول</span><strong>{request.longitude}</strong></div>
                <a className="button secondary" href={mapUrl!} target="_blank" rel="noreferrer">فتح الموقع في Google Maps</a>
              </div>
            ) : <p className="detailMuted">لا توجد إحداثيات مسجلة لهذا الطلب.</p>}
          </article>

          <aside className="detailSideColumn">
            <section className="card detailCard">
              <h2>الإسناد</h2>
              <RequestTechnicianControl
                requestId={request.id}
                serviceType={request.service_type}
                technicians={technicianOptions}
                currentTechnicianId={assignedTechnician?.id ?? null}
              />
              {assignedTechnician ? (
                <div className="assignedTechnician">
                  <strong>{assignedTechnician.name}</strong>
                  {assignedTechnician.phone ? <a href={`tel:${assignedTechnician.phone}`}>{assignedTechnician.phone}</a> : null}
                  <span>{activeAssignment?.status === "accepted" ? "الفني وافق على الإسناد" : "الإسناد بانتظار رد الفني"}</span>
                </div>
              ) : <p className="detailMuted">لم يتم إسناد فني حاليًا.</p>}
            </section>

            <section className="card detailCard">
              <h2>النتيجة والقطع / التعديلات</h2>
              <div className="detailFields singleColumn">
                <div><span>نتيجة الزيارة</span><strong>{request.visit_outcome ? WORKFLOW_LABELS[request.visit_outcome] ?? request.visit_outcome : "لم تسجل بعد"}</strong></div>
                <div className="detailWide"><span>القطع / التعديلات والملاحظات</span><p className={request.visit_notes ? "" : "detailMuted"}>{request.visit_notes || "لا توجد قطع أو تعديلات أو ملاحظات مسجلة بعد."}</p></div>
                <div><span>آخر تحديث لسير العمل</span><strong>{formatDate(request.workflow_updated_at)}</strong></div>
              </div>
            </section>
          </aside>
        </section>

        <section className="card detailCard">
          <h2>سجل الإسناد</h2>
          {!assignments?.length ? <p className="detailMuted">لا يوجد سجل إسناد لهذا الطلب.</p> : (
            <div className="assignmentHistory">
              {assignments.map((assignment) => {
                const technician = technicianOptions.find((item) => item.id === assignment.technician_id);
                return (
                  <div className="assignmentHistoryItem" key={assignment.id}>
                    <div><strong>{technician?.name || "فني غير متاح حاليًا"}</strong><span>{ASSIGNMENT_LABELS[assignment.status] ?? assignment.status}</span></div>
                    <div><span>أُسند: {formatDate(assignment.assigned_at)}</span><span>الرد: {formatDate(assignment.responded_at)}</span></div>
                    {assignment.notes ? <p>{assignment.notes}</p> : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <style>{`
          .requestDetailPage { padding-bottom: 48px; }
          .requestDetailGrid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr); gap: 18px; align-items: start; }
          .detailSideColumn { display: grid; gap: 18px; }
          .detailCard { padding: 22px; }
          .detailCard h2 { margin: 24px 0 14px; font-size: 1.05rem; }
          .detailCard > h2:first-child { margin-top: 0; }
          .detailCardHeader { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding-bottom: 18px; border-bottom: 1px solid rgba(0,0,0,.08); }
          .detailDates { display: grid; gap: 4px; text-align: left; }
          .detailDates span, .detailFields span, .locationSummary span { color: #6b7280; font-size: .84rem; }
          .detailFields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
          .detailFields > div { display: grid; gap: 5px; min-width: 0; }
          .detailFields a { color: inherit; text-decoration: underline; }
          .detailFields p { margin: 0; white-space: pre-wrap; line-height: 1.8; }
          .detailWide { grid-column: 1 / -1; }
          .singleColumn { grid-template-columns: 1fr; }
          .locationSummary { display: flex; flex-wrap: wrap; gap: 14px; align-items: end; }
          .locationSummary > div { display: grid; gap: 4px; }
          .detailMuted { color: #6b7280; margin: 0; line-height: 1.7; }
          .assignedTechnician { display: grid; gap: 5px; margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(0,0,0,.08); }
          .assignedTechnician a { color: inherit; text-decoration: underline; }
          .assignedTechnician span { color: #6b7280; font-size: .85rem; }
          .assignmentHistory { display: grid; gap: 10px; }
          .assignmentHistoryItem { padding: 14px; border: 1px solid rgba(0,0,0,.08); border-radius: 12px; display: grid; gap: 8px; }
          .assignmentHistoryItem > div { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
          .assignmentHistoryItem span { color: #6b7280; font-size: .86rem; }
          .assignmentHistoryItem p { margin: 0; white-space: pre-wrap; line-height: 1.7; }
          @media (max-width: 800px) {
            .requestDetailGrid { grid-template-columns: 1fr; }
            .detailFields { grid-template-columns: 1fr; }
            .detailWide { grid-column: auto; }
            .detailCardHeader { flex-direction: column; }
          }
        `}</style>
      </div>
    </main>
  );
}
